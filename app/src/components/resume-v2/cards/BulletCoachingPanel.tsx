import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, PencilLine, Sparkles, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource, GapChatContext, GapChatMessage } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { BulletContextHeader } from './bullet-coaching/BulletContextHeader';
import { BulletBeforeAfter } from './bullet-coaching/BulletBeforeAfter';
import { AISuggestionCards } from './bullet-coaching/AISuggestionCards';
import { EnhanceButtonBar } from './bullet-coaching/EnhanceButtonBar';
import type { EnhanceAction } from './bullet-coaching/EnhanceButtonBar';
import { CustomEditArea } from './bullet-coaching/CustomEditArea';
import type { OptimisticResumeEditMetadata } from '@/lib/resume-edit-progress';

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
  // New: optional AI enhancement handler
  onBulletEnhance?: (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
    context?: Partial<GapChatContext>,
  ) => Promise<EnhanceResult | null>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLineLabel(lineKind?: GapChatContext['lineKind']): string {
  switch (lineKind) {
    case 'summary':
      return 'summary line';
    case 'competency':
      return 'competency';
    case 'section_summary':
      return 'section intro';
    case 'custom_line':
      return 'section line';
    default:
      return 'line';
  }
}

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

type BestFirstMoveAction =
  | 'focus_question'
  | 'reuse_prior'
  | 'tighten_rewrite'
  | 'quantify_rewrite'
  | 'rewrite_honestly'
  | 'apply_suggestion'
  | 'write_own';

interface BestFirstMoveConfig {
  title: string;
  body: string;
  actionLabel?: string;
  action?: BestFirstMoveAction;
}

function buildBestFirstMove(args: {
  reviewState: ResumeReviewState;
  nextBestAction?: NextBestAction;
  lineKind?: GapChatContext['lineKind'];
  lineLabel: string;
  topClarifyingQuestion?: string;
  hasPriorClarifications: boolean;
  hasSuggestion: boolean;
  sectionLabel?: string;
  sectionRationale?: string;
  sectionRecommendedForJob?: boolean;
}): BestFirstMoveConfig | null {
  const {
    reviewState,
    nextBestAction,
    lineKind,
    lineLabel,
    topClarifyingQuestion,
    hasPriorClarifications,
    hasSuggestion,
    sectionLabel,
    sectionRationale,
    sectionRecommendedForJob,
  } = args;

  const sectionContext = sectionRecommendedForJob
    ? `${sectionLabel ?? 'This section'} is worth polishing early for this role.`
    : sectionRationale
      ? sectionRationale
      : '';

  if (hasPriorClarifications) {
    return {
      title: 'Best first move',
      body: [sectionContext, `You already shared a useful answer for this ${lineLabel}. Reuse that confirmed detail before asking or typing anything new.`]
        .filter(Boolean)
        .join(' '),
      actionLabel: 'Rewrite from earlier answer',
      action: 'reuse_prior',
    };
  }

  if (reviewState === 'code_red') {
    return {
      title: 'Best first move',
      body: topClarifyingQuestion
        ? `${sectionContext ? `${sectionContext} ` : ''}We still need one concrete truth before this ${lineLabel} is safe to keep. Start by answering: ${topClarifyingQuestion}`
        : `${sectionContext ? `${sectionContext} ` : ''}We still need one concrete truth before this ${lineLabel} is safe to keep.`,
      actionLabel: 'Answer the question below',
      action: 'focus_question',
    };
  }

  if (nextBestAction === 'answer') {
    return {
      title: 'Best first move',
      body: topClarifyingQuestion
        ? `${sectionContext ? `${sectionContext} ` : ''}The next gain comes from adding one missing concrete detail to this ${lineLabel}. Use this prompt while you rewrite: ${topClarifyingQuestion}`
        : `${sectionContext ? `${sectionContext} ` : ''}The next gain comes from adding one missing concrete detail to this ${lineLabel}.`,
      actionLabel: 'Rewrite with the missing detail',
      action: 'write_own',
    };
  }

  if (nextBestAction === 'quantify') {
    return {
      title: 'Best first move',
      body: `${sectionContext ? `${sectionContext} ` : ''}The proof is already here. The fastest win is adding business impact, scale, or one defensible metric so this ${lineLabel} lands harder.`,
      actionLabel: 'Run impact rewrite',
      action: 'quantify_rewrite',
    };
  }

  if (nextBestAction === 'confirm' || reviewState === 'confirm_fit') {
    return {
      title: 'Best first move',
      body: `${sectionContext ? `${sectionContext} ` : ''}This is directionally right, but it needs the most honest version of the truth before you keep it as-is.`,
      actionLabel: 'Rewrite it honestly',
      action: 'rewrite_honestly',
    };
  }

  if (hasSuggestion && nextBestAction === 'accept') {
    return {
      title: 'Best first move',
      body: `${sectionContext ? `${sectionContext} ` : ''}The strongest suggestion is already ready to apply. If it reads true, take the quick win and move on.`,
      actionLabel: 'Apply strongest version',
      action: 'apply_suggestion',
    };
  }

  if (nextBestAction === 'tighten' || reviewState === 'strengthen') {
    return {
      title: 'Best first move',
      body: `${sectionContext ? `${sectionContext} ` : ''}The evidence is real. The fastest win is a sharper rewrite that makes the fit and impact obvious right away.`,
      actionLabel: lineKind === 'summary' ? 'Run opening rewrite' : 'Run role-fit rewrite',
      action: 'tighten_rewrite',
    };
  }

  if (hasSuggestion) {
    return {
      title: 'Best first move',
      body: `${sectionContext ? `${sectionContext} ` : ''}You already have enough here to move this ${lineLabel} forward right now.`,
      actionLabel: 'Apply strongest version',
      action: 'apply_suggestion',
    };
  }

  return {
    title: 'Best first move',
    body: `${sectionContext ? `${sectionContext} ` : ''}Start by rewriting this ${lineLabel} in your own words, then use AI upgrades once the truth is anchored.`,
    actionLabel: 'Write my own version',
    action: 'write_own',
  };
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
  onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoReuseRef = useRef<string | null>(null);
  const codeRedTextareaRef = useRef<HTMLTextAreaElement>(null);

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
  const applyMetadata = useCallback((overrides?: Partial<OptimisticResumeEditMetadata>): OptimisticResumeEditMetadata => ({
    requirement: requirements[0],
    requirements,
    reviewState,
    requirementSource,
    evidenceFound,
    proofLevel,
    framingGuardrail,
    nextBestAction,
    ...overrides,
  }), [
    evidenceFound,
    framingGuardrail,
    nextBestAction,
    proofLevel,
    requirementSource,
    requirements,
    reviewState,
  ]);

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
  const latestAssistant = latestAssistantMessage(itemState?.messages);

  // ── Alternative bullets — prefer enhance results, fall back to chatContext ─
  const chatAlternatives = chatContext.alternativeBullets ?? [];
  const alternatives = enhanceResult?.alternatives ?? chatAlternatives;
  const chatSuggestedLanguage = latestAssistant?.suggestedLanguage ?? itemState?.resolvedLanguage ?? null;

  // ── Determine the currently displayed suggestion ───────────────────────────
  const primarySuggestion =
    selectedSuggestion !== null && alternatives[selectedSuggestion]
      ? alternatives[selectedSuggestion].text
      : enhanceResult?.enhancedBullet ?? chatSuggestedLanguage ?? null;

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
        chatContext,
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
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, onApplyToResume, onClose, section, bulletIndex]);

  // ── Apply from custom edit area ────────────────────────────────────────────
  const handleApplyEdit = useCallback(() => {
    const text = editDraft.trim();
    if (!text) return;
    onApplyToResume(section, bulletIndex, text, applyMetadata());
    onClose();
  }, [applyMetadata, editDraft, onApplyToResume, onClose, section, bulletIndex]);

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
    const classification = classificationForReviewState(reviewState);
    gapChat.sendMessage(chatKey, text, chatContext, classification).finally(() => {
      setIsSubmittingContext(false);
      setCodeRedContext('');
    });
  }, [codeRedContext, isChatLoading, gapChat, chatKey, chatContext, reviewState]);

  // ── Derived display flags ─────────────────────────────────────────────────
  const isCodeRedNoEvidence =
    reviewState === 'code_red' && !evidenceFound.trim() && alternatives.length === 0 && !chatSuggestedLanguage;
  const primaryRequirement = requirements[0];
  const resolvedSourceEvidence = sourceEvidence ?? chatContext.sourceEvidence;
  const lineLabel = getLineLabel(chatContext.lineKind);
  const coachTitle = chatContext.sectionLabel
    ? `Improve ${chatContext.sectionLabel}`
    : `Improve this ${lineLabel}`;
  const topClarifyingQuestion = chatContext.clarifyingQuestions?.[0]?.trim();
  const remainingClarifyingQuestions = (chatContext.clarifyingQuestions ?? [])
    .map((question) => question.trim())
    .filter(Boolean)
    .slice(topClarifyingQuestion ? 1 : 0, topClarifyingQuestion ? 3 : 2);
  const priorClarifications = (chatContext.priorClarifications ?? []).slice(0, 2);
  const relatedSuggestionTargets = (latestAssistant?.relatedLineSuggestions ?? [])
    .map((suggestion) => {
      const candidate = chatContext.relatedLineCandidates?.find((item) => item.id === suggestion.candidateId);
      return candidate ? { candidate, suggestion } : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const handleApplyRelatedSuggestion = useCallback((sectionKey: string, targetIndex: number, text: string) => {
    onApplyToResume(sectionKey, targetIndex, text, applyMetadata());
  }, [applyMetadata, onApplyToResume]);

  const handleApplyAllRelatedSuggestions = useCallback(() => {
    relatedSuggestionTargets.forEach(({ candidate, suggestion }) => {
      onApplyToResume(candidate.section, candidate.index, suggestion.suggestedLanguage, applyMetadata());
    });
  }, [applyMetadata, onApplyToResume, relatedSuggestionTargets]);

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
        priorClarifications: chatContext.priorClarifications?.filter((candidate) => candidate.id === entry.id) ?? chatContext.priorClarifications,
      },
      classification,
    );
  }, [isChatLoading, reviewState, primaryRequirement, requirements, lineLabel, gapChat, chatKey, chatContext]);

  useEffect(() => {
    if (!initialReuseClarificationId) return;
    if (autoReuseRef.current === initialReuseClarificationId) return;
    if (isChatLoading) return;
    if ((itemState?.messages?.length ?? 0) > 0) return;
    const entry = priorClarifications.find((candidate) => candidate.id === initialReuseClarificationId);
    if (!entry) return;
    autoReuseRef.current = initialReuseClarificationId;
    handleReusePriorClarification(entry);
  }, [handleReusePriorClarification, initialReuseClarificationId, isChatLoading, itemState?.messages, priorClarifications]);

  const bestFirstMove = buildBestFirstMove({
    reviewState,
    nextBestAction,
    lineKind: chatContext.lineKind,
    lineLabel,
    topClarifyingQuestion,
    hasPriorClarifications: priorClarifications.length > 0,
    hasSuggestion: Boolean(primarySuggestion),
    sectionLabel: chatContext.sectionLabel,
    sectionRationale: chatContext.sectionRationale,
    sectionRecommendedForJob: chatContext.sectionRecommendedForJob,
  });

  const handleBestFirstMove = useCallback(() => {
    switch (bestFirstMove?.action) {
      case 'focus_question':
        codeRedTextareaRef.current?.focus();
        break;
      case 'reuse_prior':
        if (priorClarifications[0]) {
          handleReusePriorClarification(priorClarifications[0]);
        }
        break;
      case 'quantify_rewrite':
        if (onBulletEnhance) {
          void handleEnhance('show_accountability');
        } else {
          handleWriteMyOwn();
        }
        break;
      case 'tighten_rewrite':
        if (onBulletEnhance) {
          void handleEnhance(chatContext.lineKind === 'summary' ? 'show_transformation' : 'connect_to_role');
        } else {
          handleOpenEdit();
        }
        break;
      case 'rewrite_honestly':
        handleWriteMyOwn();
        break;
      case 'apply_suggestion':
        if (primarySuggestion) {
          handleAcceptSuggestion(primarySuggestion);
        }
        break;
      case 'write_own':
        handleWriteMyOwn();
        break;
      default:
        break;
    }
  }, [
    bestFirstMove?.action,
    chatContext.lineKind,
    handleAcceptSuggestion,
    handleEnhance,
    handleOpenEdit,
    handleReusePriorClarification,
    handleWriteMyOwn,
    onBulletEnhance,
    primarySuggestion,
    priorClarifications,
  ]);

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="panel-surface mt-3 space-y-3 p-3 focus:outline-none sm:p-4"
      style={{
        animation: 'fade-slide-in 200ms ease-out forwards',
      }}
    >
      {/* ── Close button ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em]"
            style={{ color: 'var(--text-soft)' }}
          >
            {coachTitle}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-[var(--text-soft)]">
            Live on resume · {chatContext.sectionLabel ?? lineLabel}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
          style={{ color: 'var(--text-soft)' }}
          aria-label="Close resume coach"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {primaryRequirement && (
        <BulletContextHeader
          requirement={primaryRequirement}
          requirementSource={requirementSource}
          evidenceFound={evidenceFound}
          sourceEvidence={resolvedSourceEvidence}
          reviewState={reviewState}
          proofLevel={proofLevel}
          framingGuardrail={framingGuardrail}
          nextBestAction={nextBestAction}
        />
      )}

      {bestFirstMove && (
        <div
          className="rounded-lg px-3 py-3"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--text-soft)' }}
              >
                {bestFirstMove.title}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-strong)' }}>
                {bestFirstMove.body}
              </p>
            </div>
            {bestFirstMove.actionLabel && (
              <button
                type="button"
                onClick={handleBestFirstMove}
                disabled={isChatLoading || isEnhancing}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
                  (isChatLoading || isEnhancing) && 'opacity-50 cursor-not-allowed',
                )}
                style={{
                  borderColor: 'var(--line-soft)',
                  color: 'var(--text-strong)',
                  background: 'var(--surface-elevated)',
                }}
              >
                {bestFirstMove.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}

      {remainingClarifyingQuestions.length > 0 && priorClarifications.length === 0 && !isCodeRedNoEvidence && (
        <div
          className="rounded-lg px-3 py-3"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-soft)' }}
          >
            Fastest way to strengthen this {lineLabel}
          </p>
          {chatContext.coachingGoal && (
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-soft)' }}>
              {chatContext.coachingGoal}
            </p>
          )}
          <ul className="mt-2 space-y-1.5">
            {remainingClarifyingQuestions.map((question) => (
              <li
                key={question}
                className="text-sm leading-relaxed"
                style={{ color: 'var(--text-strong)' }}
              >
                {question}
              </li>
            ))}
          </ul>
        </div>
      )}

      {priorClarifications.length > 0 && (
        <div
          className="rounded-lg px-3 py-3"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <p
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-soft)' }}
          >
            Reuse confirmed detail
          </p>
          <div className="mt-2 space-y-2">
            {priorClarifications.map((entry) => (
              <div key={entry.id} className="space-y-1">
                <p className="text-xs font-medium" style={{ color: 'var(--text-strong)' }}>
                  {entry.topic}
                  {entry.primaryFamily ? ` • ${entry.primaryFamily}` : ''}
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {entry.userInput}
                </p>
                {entry.appliedLanguage && (
                  <p className="text-xs leading-5" style={{ color: 'var(--text-soft)' }}>
                    Resume wording used: {entry.appliedLanguage}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => handleReusePriorClarification(entry)}
                  disabled={isChatLoading}
                  className={cn(
                  'inline-flex min-h-[36px] items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors',
                  isChatLoading && 'opacity-50 cursor-not-allowed',
                )}
                  style={{
                    borderColor: 'var(--line-soft)',
                    color: 'var(--text-strong)',
                    background: 'var(--surface-elevated)',
                  }}
                >
                  Rewrite from this answer
                </button>
              </div>
            ))}
          </div>
        </div>
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
          lineKind={chatContext.lineKind}
          sectionLabel={chatContext.sectionLabel}
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
          {topClarifyingQuestion && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              Start with this: {topClarifyingQuestion}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={codeRedTextareaRef}
              value={codeRedContext}
              onChange={(e) => setCodeRedContext(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitCodeRedContext();
                }
              }}
              placeholder={topClarifyingQuestion ?? 'Describe what you\'ve actually done in this area…'}
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

      {relatedSuggestionTargets.length > 0 && (
        <div
          className="space-y-3 rounded-lg px-3 py-3"
          style={{
            background: 'var(--surface-1)',
            border: '1px solid var(--line-soft)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p
                className="text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--text-soft)' }}
              >
                One answer can strengthen nearby lines too
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This detail also gives us stronger footing for {relatedSuggestionTargets.length} other {relatedSuggestionTargets.length === 1 ? 'line' : 'lines'}.
              </p>
            </div>
            {relatedSuggestionTargets.length > 1 && (
              <button
                type="button"
                onClick={handleApplyAllRelatedSuggestions}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  borderColor: 'var(--line-soft)',
                  color: 'var(--text-strong)',
                  background: 'var(--surface-elevated)',
                }}
              >
                Apply all nearby lines
              </button>
            )}
          </div>

          <div className="space-y-2">
            {relatedSuggestionTargets.map(({ candidate, suggestion }) => (
              <div
                key={candidate.id}
                className="rounded-lg border px-3 py-3"
                style={{
                  borderColor: 'var(--line-soft)',
                  background: 'var(--surface-elevated)',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--text-soft)' }}>
                      {candidate.label}
                    </p>
                    {suggestion.requirement && (
                      <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-soft)' }}>
                        Supports: {suggestion.requirement}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApplyRelatedSuggestion(candidate.section, candidate.index, suggestion.suggestedLanguage)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      background: 'var(--badge-blue-bg)',
                      color: 'var(--badge-blue-text)',
                      border: '1px solid var(--badge-blue-text)',
                    }}
                  >
                    Apply to this line
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-soft)' }}>
                  Current: {candidate.lineText}
                </p>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-strong)' }}>
                  {suggestion.suggestedLanguage}
                </p>
                {suggestion.rationale && (
                  <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-soft)' }}>
                    Why this also improves: {suggestion.rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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
              Use This Version
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
              aria-label="Rewrite this line yourself"
            >
              Rewrite Myself
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
        {canRemove && (
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
            aria-label={confirmRemove ? 'Confirm removal of this line' : 'Remove this line from the resume'}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {confirmRemove ? 'Confirm removal' : 'Remove this line'}
          </button>
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
