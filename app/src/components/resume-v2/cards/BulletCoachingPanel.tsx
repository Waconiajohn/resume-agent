import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource, GapChatContext, GapChatMessage, SuggestionScore } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { CustomEditArea } from './bullet-coaching/CustomEditArea';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';

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
  const optionTexts = [
    bulletText,
    primarySuggestion ?? undefined,
    ...alternatives.map((a) => a.text),
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

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
  onBulletEnhance: _onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoReuseRef = useRef<string | null>(null);

  // ── Internal state ─────────────────────────────────────────────────────────
  const [editDraft, setEditDraft] = useState('');
  const [showCustomEdit, setShowCustomEdit] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

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

  const primarySuggestion = chatSuggestedLanguage ?? alternatives[0]?.text ?? null;
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
    evidenceFound.trim() !== bulletText.trim();

  // Fallback: if the scoring engine didn't produce a verdict but the suggestion
  // is identical to current text, treat it as 'collapse'
  const effectiveVerdict: 'show' | 'collapse' | 'ask_question' | undefined = suggestionScore?.verdict
    ?? (primarySuggestion && bulletText.trim().toLowerCase() === primarySuggestion.trim().toLowerCase()
      ? 'collapse' as const
      : undefined);

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
      className="mt-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm focus:outline-none"
      style={{ animation: 'fade-slide-in 200ms ease-out forwards' }}
    >
      {/* ── Block 1: What You Have ─────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide mb-2">
          {sectionDisplayName}
        </p>
        <p className="text-sm leading-relaxed text-white">
          {bulletText}
        </p>
      </div>

      {/* ── Block 2: What We Suggest ───────────────────────────────────── */}
      {(showAIDiff || featuredOption || isCodeRedNoEvidence || effectiveVerdict === 'collapse' || effectiveVerdict === 'ask_question') && (
        <div className="border-t border-white/10 px-4 py-3 space-y-3">

          {/* AI-enhanced diff view */}
          {showAIDiff && (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Original
                </p>
                <p className="text-sm leading-relaxed text-gray-300">
                  {evidenceFound.trim()}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Our Enhancement
                </p>
                <p className="text-sm leading-relaxed text-gray-200">
                  {bulletText}
                </p>
              </div>
              {addressesLabel && (
                <p className="text-xs text-gray-300">
                  Addresses: <span className="text-gray-400">{addressesLabel}</span>
                </p>
              )}
            </div>
          )}

          {/* Verdict: collapse — current text is strong */}
          {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'collapse' && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-emerald-400 uppercase tracking-wide mb-1">
                Looks Strong
              </p>
              <p className="text-sm leading-relaxed text-gray-300">
                This section already addresses the requirement well. Click &ldquo;Keep Current&rdquo; to move on, or &ldquo;Edit Myself&rdquo; to make changes.
              </p>
            </div>
          )}

          {/* Verdict: ask_question — suggestion would downgrade, ask for context instead */}
          {!showAIDiff && !isCodeRedNoEvidence && effectiveVerdict === 'ask_question' && suggestionScore?.suggestedQuestion && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-1">
                More Context Needed
              </p>
              <p className="text-sm leading-relaxed text-gray-200">
                {suggestionScore?.suggestedQuestion}
              </p>
              {addressesLabel && (
                <p className="text-xs text-gray-300">
                  For: <span className="text-gray-400">{addressesLabel}</span>
                </p>
              )}
            </div>
          )}

          {/* Standard suggestion (verdict: show, or no score computed) */}
          {!showAIDiff && !isCodeRedNoEvidence && featuredOption && effectiveVerdict !== 'collapse' && effectiveVerdict !== 'ask_question' && (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Suggested Improvement
                </p>
                <p className="text-sm leading-relaxed text-gray-200">
                  {featuredOption.text}
                </p>
              </div>
              {addressesLabel && (
                <p className="text-xs text-gray-300">
                  Addresses: <span className="text-gray-400">{addressesLabel}</span>
                </p>
              )}
              {priorClarifications.length > 0 && (
                <p className="text-xs text-gray-300 italic">
                  I am also using this earlier detail you confirmed: &ldquo;{priorClarifications[0].userInput}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Code red — no evidence, needs candidate input */}
          {isCodeRedNoEvidence && (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                  Gap Identified
                </p>
                <p className="text-sm leading-relaxed text-gray-300">
                  This role requires{' '}
                  <span className="text-gray-200 font-medium">
                    {primaryRequirement ?? 'this skill'}
                  </span>
                  . We don&apos;t have evidence of this in your resume yet.
                </p>
              </div>
              {topClarifyingDetail && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <p className="text-xs text-gray-400 italic">
                    If you want to strengthen this later, the extra detail I would want is: {topClarifyingDetail}.
                  </p>
                </div>
              )}
              <p className="text-xs text-gray-300">
                Can you confirm this reflects your experience?
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Custom edit area (when open) ───────────────────────────────── */}
      {showCustomEdit && (
        <div className="border-t border-white/10 px-4 py-3">
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

      {/* ── Block 3: Actions ───────────────────────────────────────────── */}
      <div className="border-t border-white/10 px-4 py-3 space-y-3">

        {/* Primary action buttons */}
        {!showCustomEdit && (
          <div className="flex flex-wrap items-center gap-2">

            {/* AI-enhanced: Accept / Edit / Keep Original */}
            {showAIDiff && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Accept Enhancement
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Edit Myself
                </button>
                <button
                  type="button"
                  onClick={handleRevertToOriginal}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Keep Original
                </button>
              </>
            )}

            {/* Code red: generate safe version / write own / skip */}
            {isCodeRedNoEvidence && (
              <>
                <button
                  type="button"
                  onClick={handleGenerateSafeRewrite}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  {isChatLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /><span className="sr-only">Loading</span></>
                  ) : (
                    'Use This Language'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Write My Own
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Skip This Gap
                </button>
              </>
            )}

            {/* Verdict: collapse — Keep / Edit */}
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
                  className="rounded-lg px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 transition-colors"
                >
                  Edit Myself
                </button>
              </>
            )}

            {/* Verdict: ask_question — Answer / Edit / Skip */}
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
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors"
                >
                  Skip
                </button>
              </>
            )}

            {/* Standard suggestion: Use / Edit / Skip (verdict: show, or no score) */}
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
                  Use Suggestion
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(featuredOption.text)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Edit Myself
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Skip
                </button>
              </>
            )}

            {/* No suggestion, no AI diff, no code red: just edit/skip */}
            {!showAIDiff && !isCodeRedNoEvidence && !featuredOption && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenEdit(bulletText)}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Edit Myself
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isChatLoading}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-gray-200 transition-colors',
                    isChatLoading && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  Skip
                </button>
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
              className="rounded-lg px-3 py-2 text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 transition-colors"
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
              className="flex items-center gap-1 text-sm text-gray-300 hover:text-gray-300 transition-colors"
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
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                        {option.label}
                      </p>
                      <p className="text-sm leading-relaxed text-gray-200">
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
          <div className="border-t border-white/10 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                Also improve nearby lines
              </p>
              <p className="text-xs text-gray-300">
                {relatedSuggestionTargets.length === 1
                  ? 'This same detail can also improve 1 other line.'
                  : `This same detail can also improve ${relatedSuggestionTargets.length} other lines.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const [first] = relatedSuggestionTargets;
                  if (first) {
                    handleApplyRelatedSuggestion(first.candidate.section, first.candidate.index, first.suggestion.suggestedLanguage);
                  }
                }}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10 transition-colors"
              >
                Show nearby lines
              </button>
              {relatedSuggestionTargets.length > 1 && (
                <button
                  type="button"
                  onClick={handleApplyAllRelatedSuggestions}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/10 transition-colors"
                >
                  Apply all nearby lines
                </button>
              )}
            </div>
            <div className="space-y-2">
              {relatedSuggestionTargets.map(({ candidate, suggestion }) => (
                <div
                  key={candidate.id}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{candidate.label}</p>
                      {suggestion.requirement && (
                        <p className="mt-0.5 text-xs text-gray-300">Supports: {suggestion.requirement}</p>
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
                  <p className="mt-1.5 text-xs text-gray-300">Current: {candidate.lineText}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-200">{suggestion.suggestedLanguage}</p>
                  {suggestion.rationale && (
                    <p className="mt-1 text-xs text-gray-300">Why this also improves: {suggestion.rationale}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remove */}
        {canRemove && (
          <div className="border-t border-white/10 pt-2">
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
                  : 'text-gray-300 hover:text-red-400',
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
