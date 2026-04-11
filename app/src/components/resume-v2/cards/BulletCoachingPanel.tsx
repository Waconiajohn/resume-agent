import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource, GapChatContext, GapChatMessage, SuggestionScore } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { CustomEditArea } from './bullet-coaching/CustomEditArea';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';
import type { SectionType } from '@/lib/section-enhance-config';
import { getEnhanceActionsForSection, getDefaultEnhanceAction } from '@/lib/section-enhance-config';

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
  showCloseButton?: boolean;
  /**
   * True when this bullet was produced by the AI pipeline (is_new on the source ResumeBullet).
   * When true and evidenceFound is non-empty, a diff view is shown comparing the original
   * evidence text against the AI-written bullet text.
   */
  isAIEnhanced?: boolean;
  /** Quality score from the shared suggestion scoring engine */
  suggestionScore?: SuggestionScore;
  /** AI-generated suggestion from the rewrite queue pipeline */
  queueSuggestedDraft?: string;
  /** Section type for context-aware enhancement actions and auto-enhance default */
  sectionType?: SectionType;
  onBulletEnhance?: (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
    context?: Partial<GapChatContext>,
  ) => Promise<EnhanceResult | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classificationForReviewState(reviewState: ResumeReviewState): 'partial' | 'missing' | 'strong' {
  if (reviewState === 'code_red') return 'missing';
  if (reviewState === 'strengthen' || reviewState === 'confirm_fit') return 'partial';
  return 'strong';
}

function latestAssistantMessage(messages: GapChatMessage[] | undefined): GapChatMessage | null {
  if (!messages?.length) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant') {
      return messages[index];
    }
  }
  return null;
}

function formatMissingDetailPrompt(question?: string): string | undefined {
  const trimmed = question?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[?.!]+$/, '').trim();
}

interface SuggestedWordingOption {
  id: string;
  label: string;
  text: string;
  isRecommended: boolean;
}

function buildSuggestedWordingOptions(args: {
  bulletText: string;
  primarySuggestion: string | null;
  alternatives: Array<{ text: string; angle: string }>;
}): SuggestedWordingOption[] {
  const { bulletText, primarySuggestion, alternatives } = args;
  // Only include actual suggestions — never the current bullet text itself
  const bulletLower = bulletText.trim().toLowerCase();
  const optionTexts = [
    primarySuggestion ?? undefined,
    ...alternatives.map((a) => a.text),
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .filter((v) => v.trim().toLowerCase() !== bulletLower);

  const uniqueTexts: string[] = [];
  optionTexts.forEach((v) => {
    if (!uniqueTexts.some((c) => c.trim().toLowerCase() === v.trim().toLowerCase())) {
      uniqueTexts.push(v.trim());
    }
  });

  const trimmedPrimary = primarySuggestion?.trim().toLowerCase();
  const recommendedIndex = trimmedPrimary
    ? Math.max(0, uniqueTexts.findIndex((v) => v.trim().toLowerCase() === trimmedPrimary))
    : Math.min(uniqueTexts.length - 1, 1);

  const selected = uniqueTexts.slice(0, 3);

  return selected.map((text, index) => {
    const isRecommended = index === recommendedIndex;
    const label = (() => {
      if (selected.length === 1) return 'Recommended version';
      if (selected.length === 2) return index === 0 ? 'Safer version' : 'Recommended version';
      return index === 0 ? 'Safer version' : index === 1 ? 'Recommended version' : 'Stronger version';
    })();
    return { id: `${label}-${text.slice(0, 24)}`, label, text, isRecommended };
  });
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
  gapChat,
  chatContext,
  onApplyToResume,
  onRemoveBullet,
  onClose,
  canRemove = true,
  initialReuseClarificationId,
  showCloseButton: _showCloseButton = true,
  isAIEnhanced,
  suggestionScore,
  queueSuggestedDraft,
  sectionType = 'experience_bullet',
  onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoReuseRef = useRef<string | null>(null);
  const autoEnhancedRef = useRef(false);

  // ── Internal state ─────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState('');
  const [showCustomEdit, setShowCustomEdit] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);

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

  // ── Derive chat state ──────────────────────────────────────────────────────
  const chatKey = requirements[0] ?? bulletText;
  const itemState = gapChat.getItemState(chatKey);
  const isChatLoading = itemState?.isLoading ?? false;
  const latestAssistant = latestAssistantMessage(itemState?.messages);

  const chatAlternatives = chatContext.alternativeBullets ?? [];
  const alternatives = chatAlternatives;
  const chatSuggestedLanguage = latestAssistant?.suggestedLanguage
    ?? itemState?.resolvedLanguage
    ?? chatContext.recommendedBullet
    ?? null;

  const primarySuggestion = chatSuggestedLanguage ?? queueSuggestedDraft ?? alternatives[0]?.text ?? null;
  const primaryRequirement = requirements[0];
  const resolvedSourceEvidence = sourceEvidence ?? chatContext.sourceEvidence;
  const lineLabel = chatContext.lineKind === 'summary' ? 'summary line'
    : chatContext.lineKind === 'competency' ? 'competency'
    : chatContext.lineKind === 'section_summary' ? 'section intro'
    : chatContext.lineKind === 'custom_line' ? 'section line'
    : 'line';

  const topClarifyingQuestion = chatContext.clarifyingQuestions?.[0]?.trim();
  const topClarifyingDetail = formatMissingDetailPrompt(topClarifyingQuestion);
  const priorClarifications = (chatContext.priorClarifications ?? []).slice(0, 2);

  // ── Derived flags ──────────────────────────────────────────────────────────
  const isCodeRedNoEvidence =
    reviewState === 'code_red' && !evidenceFound.trim() && alternatives.length === 0 && !chatSuggestedLanguage;

  const showAIDiff =
    isAIEnhanced &&
    evidenceFound.trim().length > 0 &&
    evidenceFound.trim() !== bulletText.trim() &&
    (() => {
      const currentWords = new Set(evidenceFound.trim().toLowerCase().split(/\s+/));
      const newWords = bulletText.trim().toLowerCase().split(/\s+/);
      const overlap = newWords.filter(w => currentWords.has(w)).length;
      return overlap / Math.max(currentWords.size, newWords.length) <= 0.9;
    })();

  // Fallback: if the scoring engine didn't produce a verdict but the suggestion
  // is nearly identical to current text (>90% word overlap), treat it as 'collapse'
  const effectiveVerdict: 'show' | 'collapse' | 'ask_question' | undefined = suggestionScore?.verdict
    ?? (() => {
      if (!primarySuggestion) return undefined;
      const currentWords = new Set(bulletText.trim().toLowerCase().split(/\s+/));
      const suggestionWords = primarySuggestion.trim().toLowerCase().split(/\s+/);
      if (currentWords.size === 0 || suggestionWords.length === 0) return undefined;
      const overlap = suggestionWords.filter(w => currentWords.has(w)).length;
      const similarity = overlap / Math.max(currentWords.size, suggestionWords.length);
      return similarity > 0.9 ? 'collapse' as const : undefined;
    })();

  const relatedSuggestionTargets = (latestAssistant?.relatedLineSuggestions ?? [])
    .map((suggestion) => {
      const candidate = chatContext.relatedLineCandidates?.find((item) => item.id === suggestion.candidateId);
      return candidate ? { candidate, suggestion } : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

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

  // ── Safe rewrite (code red / no evidence) ─────────────────────────────────
  const handleGenerateSafeRewrite = useCallback(() => {
    if (isChatLoading) return;
    const classification = classificationForReviewState(reviewState);
    const targetRequirement = primaryRequirement ?? requirements[0] ?? 'this requirement';
    const promptParts = [
      `Rewrite this ${lineLabel} in the safest truthful way using only evidence we already have.`,
      `Requirement: ${targetRequirement}`,
      `Current line: ${bulletText}`,
      evidenceFound ? `Evidence already found: ${evidenceFound}` : '',
      resolvedSourceEvidence ? `What the job needs: ${resolvedSourceEvidence}` : '',
      chatContext.candidateExperienceSummary ? `Candidate background summary: ${chatContext.candidateExperienceSummary}` : '',
      'Do not ask me another question. Give me conservative, polished resume wording I can review right now.',
    ].filter(Boolean);
    gapChat.sendMessage(chatKey, promptParts.join('\n\n'), chatContext, classification);
  }, [
    bulletText, chatContext, evidenceFound, gapChat, chatKey, isChatLoading,
    lineLabel, primaryRequirement, requirements, resolvedSourceEvidence, reviewState,
  ]);

  // ── Accept a suggestion ────────────────────────────────────────────────────
  const handleAcceptSuggestion = useCallback((text: string) => {
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, onApplyToResume, onClose, section, bulletIndex]);

  // ── Revert to original evidence ───────────────────────────────────────────
  const handleRevertToOriginal = useCallback(() => {
    if (!evidenceFound.trim()) return;
    onApplyToResume(section, bulletIndex, evidenceFound.trim(), applyMetadata());
    onClose();
  }, [applyMetadata, evidenceFound, onApplyToResume, onClose, section, bulletIndex]);

  // ── On-demand AI enhancement ──────────────────────────────────────────────
  const handleEnhance = useCallback(async (action: string) => {
    if (!onBulletEnhance || isEnhancing) return;
    setIsEnhancing(true);
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
          sourceEvidence: evidenceFound,
          relatedRequirements: requirements,
        },
      );
      if (result) {
        setEnhanceResult(result);
      }
    } finally {
      setIsEnhancing(false);
    }
  }, [onBulletEnhance, isEnhancing, bulletText, requirements, evidenceFound, chatContext.lineKind, chatContext.sectionLabel, section]);

  // Reset enhance state when bullet changes
  useEffect(() => {
    autoEnhancedRef.current = false;
    setEnhanceResult(null);
    setIsEnhancing(false);
  }, [bulletText, section, bulletIndex]);

  // Auto-enhance when no suggestion exists (fires once per bullet open)
  useEffect(() => {
    if (autoEnhancedRef.current) return;
    if (primarySuggestion || enhanceResult || isEnhancing) return;
    if (!onBulletEnhance) return;
    if (effectiveVerdict === 'collapse') return;
    if (showAIDiff) return;
    if (isCodeRedNoEvidence) return;

    autoEnhancedRef.current = true;
    const defaultAction = getDefaultEnhanceAction(sectionType);
    void handleEnhance(defaultAction);
  }, [primarySuggestion, enhanceResult, isEnhancing, onBulletEnhance, effectiveVerdict, showAIDiff, isCodeRedNoEvidence, sectionType, handleEnhance]);

  // ── Apply from custom edit ────────────────────────────────────────────────
  const handleApplyEdit = useCallback(() => {
    const text = editDraft.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, editDraft, onApplyToResume, onClose, section, bulletIndex]);

  // ── Open edit area ────────────────────────────────────────────────────────
  const handleOpenEdit = useCallback((seed?: string) => {
    setEditDraft(seed ?? primarySuggestion ?? bulletText);
    setShowCustomEdit(true);
  }, [primarySuggestion, bulletText]);

  // ── Reuse prior clarification ─────────────────────────────────────────────
  const handleReusePriorClarification = useCallback((entry: ClarificationMemoryEntry) => {
    if (isChatLoading) return;
    const classification = classificationForReviewState(reviewState);
    const targetRequirement = primaryRequirement ?? requirements[0] ?? 'this requirement';
    const promptParts = [
      `Use my earlier confirmed detail to rewrite this ${lineLabel} for "${targetRequirement}".`,
      `Earlier answer: ${entry.userInput}`,
      entry.appliedLanguage ? `Existing resume wording we already used: ${entry.appliedLanguage}` : '',
      'Keep the rewrite truthful, specific, and aligned to the role.',
    ].filter(Boolean);
    gapChat.sendMessage(
      chatKey,
      promptParts.join('\n\n'),
      {
        ...chatContext,
        priorClarifications: chatContext.priorClarifications?.filter((c) => c.id === entry.id) ?? chatContext.priorClarifications,
      },
      classification,
    );
  }, [isChatLoading, reviewState, primaryRequirement, requirements, lineLabel, gapChat, chatKey, chatContext]);

  // ── Auto-reuse on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialReuseClarificationId) return;
    if (autoReuseRef.current === initialReuseClarificationId) return;
    if (isChatLoading) return;
    if ((itemState?.messages?.length ?? 0) > 0) return;
    const entry = priorClarifications.find((c) => c.id === initialReuseClarificationId);
    if (!entry) return;
    autoReuseRef.current = initialReuseClarificationId;
    handleReusePriorClarification(entry);
  }, [handleReusePriorClarification, initialReuseClarificationId, isChatLoading, itemState?.messages, priorClarifications]);

  // ── Related suggestions ───────────────────────────────────────────────────
  const handleApplyRelatedSuggestion = useCallback((sectionKey: string, targetIndex: number, text: string) => {
    onApplyToResume(sectionKey, targetIndex, text, applyMetadata());
  }, [applyMetadata, onApplyToResume]);

  const handleApplyAllRelatedSuggestions = useCallback(() => {
    relatedSuggestionTargets.forEach(({ candidate, suggestion }) => {
      onApplyToResume(candidate.section, candidate.index, suggestion.suggestedLanguage, applyMetadata());
    });
  }, [applyMetadata, onApplyToResume, relatedSuggestionTargets]);

  // ── Build wording options ─────────────────────────────────────────────────
  const suggestedOptions = buildSuggestedWordingOptions({
    bulletText,
    primarySuggestion,
    alternatives,
  });
  const featuredOption = suggestedOptions.find((o) => o.isRecommended) ?? suggestedOptions[0] ?? null;
  const alternateOptions = featuredOption
    ? suggestedOptions.filter((o) => o.id !== featuredOption.id)
    : [];

  // ── Section display name ──────────────────────────────────────────────────
  const sectionDisplayName = chatContext.sectionLabel ?? section;

  // ── Truncate for "Addresses" label ────────────────────────────────────────
  const addressesLabel = primaryRequirement
    ? primaryRequirement.length > 60
      ? `${primaryRequirement.slice(0, 59)}…`
      : primaryRequirement
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      data-testid="bullet-coaching-panel"
      tabIndex={-1}
      className="mt-3 rounded-2xl border border-[var(--line-soft)] bg-[var(--surface-elevated)] focus:outline-none"
      style={{ animation: 'fade-slide-in 200ms ease-out forwards' }}
    >
      {/* ── Current text ──────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-[var(--text-soft)] uppercase tracking-wide mb-2">
          {sectionDisplayName}
        </p>

        {/* AI diff: show original evidence text as "current" */}
        {showAIDiff ? (
          <p className="text-sm leading-relaxed text-[var(--text-soft)]">
            {evidenceFound.trim()}
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-[var(--text-strong)]">
            {bulletText}
          </p>
        )}
      </div>

      {/* ── Separator + suggestion ─────────────────────────────────────── */}
      {(showAIDiff || featuredOption || isCodeRedNoEvidence || effectiveVerdict === 'collapse' || effectiveVerdict === 'ask_question' || onBulletEnhance) && (
        <>
          <hr className="border-0 border-t border-dashed border-[var(--line-soft)] mx-4" />

          <div className="px-4 py-3 space-y-2">

            {/* AI diff: enhanced version */}
            {showAIDiff && (
              <>
                <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                  {bulletText}
                </p>
                {addressesLabel && (
                  <p className="text-xs text-[var(--text-soft)]">
                    Addresses: {addressesLabel}
                  </p>
                )}
              </>
            )}

            {/* Verdict: collapse — looks strong already */}
            {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'collapse' && (
              <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                Looks strong.
              </p>
            )}

            {/* Verdict: ask_question — need more context */}
            {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'ask_question' && suggestionScore?.suggestedQuestion && (
              <>
                <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                  {suggestionScore.suggestedQuestion}
                </p>
                {addressesLabel && (
                  <p className="text-xs text-[var(--text-soft)]">
                    For: {addressesLabel}
                  </p>
                )}
              </>
            )}

            {/* Standard suggestion (verdict: show, or no score computed) */}
            {!showAIDiff && !isCodeRedNoEvidence && featuredOption && effectiveVerdict !== 'collapse' && effectiveVerdict !== 'ask_question' && (
              <>
                <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                  {featuredOption.text}
                </p>
                {addressesLabel && (
                  <p className="text-xs text-[var(--text-soft)]">
                    Addresses: {addressesLabel}
                  </p>
                )}
                {priorClarifications.length > 0 && (
                  <p className="text-xs text-[var(--text-soft)] italic">
                    Using your earlier detail: &ldquo;{priorClarifications[0].userInput}&rdquo;
                  </p>
                )}
              </>
            )}

            {/* Code red — no evidence found */}
            {isCodeRedNoEvidence && (
              <>
                <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                  This role requires{' '}
                  <span className="font-medium">{primaryRequirement ?? 'this skill'}</span>
                  . No evidence found yet.
                </p>
                {topClarifyingDetail && (
                  <p className="text-xs text-[var(--text-soft)] italic">
                    Extra detail that would help: {topClarifyingDetail}.
                  </p>
                )}
              </>
            )}

            {/* AI enhancement — shown when no pre-computed suggestion exists */}
            {!showAIDiff && !isCodeRedNoEvidence && !featuredOption && effectiveVerdict !== 'collapse' && effectiveVerdict !== 'ask_question' && onBulletEnhance && (
              <>
                {isEnhancing && (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-4 bg-[var(--surface-1)] rounded w-full" />
                    <div className="h-4 bg-[var(--surface-1)] rounded w-5/6" />
                    <div className="h-4 bg-[var(--surface-1)] rounded w-4/6" />
                  </div>
                )}

                {!isEnhancing && !enhanceResult && (
                  <>
                    <p className="text-sm text-[var(--text-soft)] mb-2">
                      How should we strengthen this?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {getEnhanceActionsForSection(sectionType).map((config) => (
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

                {!isEnhancing && enhanceResult && (
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
                            <span className="font-medium">{alt.angle}:</span> {alt.text.slice(0, 80)}{alt.text.length > 80 ? '…' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Custom edit area (when open) ───────────────────────────────── */}
      {showCustomEdit && (
        <div className="border-t border-[var(--line-soft)] px-4 py-3">
          <CustomEditArea
            value={editDraft}
            onChange={setEditDraft}
            onApply={handleApplyEdit}
            onReset={() => setEditDraft(primarySuggestion ?? bulletText)}
            originalSuggestion={primarySuggestion ?? bulletText}
            disabled={isChatLoading}
          />
        </div>
      )}

      {/* ── Actions ────────────────────────────────────────────────────── */}
      <div className="border-t border-[var(--line-soft)] px-4 py-3 space-y-3">

        {/* Primary action buttons */}
        {!showCustomEdit && (
          <div className="flex flex-wrap items-center gap-2">

            {/* AI diff: Accept / Edit / Keep Original */}
            {showAIDiff && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    onApplyToResume(section, bulletIndex, bulletText, applyMetadata());
                  }}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleRevertToOriginal}
                  disabled={isChatLoading}
                  className={cn(
                    'text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Keep Original
                </button>
              </>
            )}

            {/* Code red: write own / skip */}
            {isCodeRedNoEvidence && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {isChatLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /><span className="sr-only">Loading</span></>
                  ) : (
                    'Write My Own'
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Skip
                </button>
              </>
            )}

            {/* Verdict: collapse — Keep Current / Edit */}
            {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'collapse' && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  Keep Current
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors"
                >
                  Edit
                </button>
              </>
            )}

            {/* Verdict: ask_question — Add Details / Skip */}
            {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'ask_question' && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                >
                  Add Details
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors"
                >
                  Skip
                </button>
              </>
            )}

            {/* Standard suggestion: Use This / Edit / Skip */}
            {!showAIDiff && !isCodeRedNoEvidence && featuredOption && effectiveVerdict !== 'collapse' && effectiveVerdict !== 'ask_question' && (
              <>
                <button
                  type="button"
                  onClick={() => handleAcceptSuggestion(featuredOption.text)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Use This
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(featuredOption.text)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Skip
                </button>
                {onBulletEnhance && (
                  <button
                    type="button"
                    onClick={() => handleEnhance('connect_to_role')}
                    disabled={isEnhancing}
                    className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    {isEnhancing ? 'Generating...' : 'Try a different angle'}
                  </button>
                )}
              </>
            )}

            {/* No pre-computed suggestion: show enhance result actions OR edit/skip */}
            {!showAIDiff && !isCodeRedNoEvidence && !featuredOption && (
              <>
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
                      disabled={isChatLoading}
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors',
                        isChatLoading && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isChatLoading}
                      className={cn(
                        'text-sm font-medium text-[var(--text-soft)] hover:text-[var(--text-strong)] transition-colors',
                        isChatLoading && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      Skip
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        )}

        {/* Cancel custom edit */}
        {showCustomEdit && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomEdit(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium bg-[var(--surface-3)] hover:bg-[var(--surface-elevated)] text-[var(--text-soft)] transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* More options — safer/stronger variants */}
        {!showCustomEdit && alternateOptions.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowMoreOptions((v) => !v)}
              className="flex items-center gap-1 text-sm text-[var(--text-soft)] hover:text-[var(--text-soft)] transition-colors"
            >
              {showMoreOptions ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              More options
            </button>
            {showMoreOptions && (
              <div className="mt-2 space-y-2">
                {alternateOptions.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-soft)] uppercase tracking-wide mb-1">
                        {option.label}
                      </p>
                      <p className="text-sm leading-relaxed text-[var(--text-strong)]">
                        {option.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAcceptSuggestion(option.text)}
                      disabled={isChatLoading}
                      className={cn(
                        'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
                        isChatLoading && 'opacity-50 cursor-not-allowed',
                      )}
                    >
                      Use
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related line suggestions */}
        {relatedSuggestionTargets.length > 0 && (
          <div className="border-t border-[var(--line-soft)] pt-3 space-y-2">
            <p className="text-xs text-[var(--text-soft)]">
              {relatedSuggestionTargets.length === 1
                ? 'This same detail can also improve 1 nearby line.'
                : `This same detail can also improve ${relatedSuggestionTargets.length} nearby lines.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const [first] = relatedSuggestionTargets;
                  if (first) {
                    handleApplyRelatedSuggestion(first.candidate.section, first.candidate.index, first.suggestion.suggestedLanguage);
                  }
                }}
                className="rounded-lg border border-[var(--line-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-3)] transition-colors"
              >
                Show nearby lines
              </button>
              {relatedSuggestionTargets.length > 1 && (
                <button
                  type="button"
                  onClick={handleApplyAllRelatedSuggestions}
                  className="rounded-lg border border-[var(--line-soft)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-soft)] hover:bg-[var(--surface-3)] transition-colors"
                >
                  Apply all nearby lines
                </button>
              )}
            </div>
            <div className="space-y-2">
              {relatedSuggestionTargets.map(({ candidate, suggestion }) => (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--text-soft)] uppercase tracking-wide">{candidate.label}</p>
                      {suggestion.requirement && (
                        <p className="mt-0.5 text-xs text-[var(--text-soft)]">Supports: {suggestion.requirement}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyRelatedSuggestion(candidate.section, candidate.index, suggestion.suggestedLanguage)}
                      className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      Apply to this line
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-soft)]">Current: {candidate.lineText}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-strong)]">{suggestion.suggestedLanguage}</p>
                  {suggestion.rationale && (
                    <p className="mt-1 text-xs text-[var(--text-soft)]">Why this also improves: {suggestion.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remove */}
        {canRemove && (
          <div className="border-t border-[var(--line-soft)] pt-2">
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
              disabled={isChatLoading}
              aria-label={confirmRemove ? 'Confirm removal of this line' : 'Remove this line from the resume'}
              className={cn(
                'text-xs font-medium transition-colors',
                confirmRemove
                  ? 'text-red-400 font-semibold'
                  : 'text-[var(--text-soft)] hover:text-red-400',
                isChatLoading && 'opacity-50 cursor-not-allowed',
              )}
            >
              {confirmRemove ? 'Confirm removal' : 'Remove this line'}
            </button>
          </div>
        )}
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
