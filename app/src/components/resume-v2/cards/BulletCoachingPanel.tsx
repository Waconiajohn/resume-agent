import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trash2, PencilLine, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClarificationMemoryEntry, FramingGuardrail, NextBestAction, ProofLevel, ResumeReviewState, RequirementSource, GapChatContext, GapChatMessage } from '@/types/resume-v2';
import type { GapChatHook } from '@/hooks/useGapChat';
import type { EnhanceResult } from '@/hooks/useBulletEnhance';
import { BulletContextHeader } from './bullet-coaching/BulletContextHeader';
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
  showCloseButton?: boolean;
  /**
   * True when this bullet was produced by the AI pipeline (is_new on the source ResumeBullet).
   * When true and evidenceFound is non-empty, a diff view is shown comparing the original
   * evidence text against the AI-written bullet text.
   */
  isAIEnhanced?: boolean;
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

function truncatePreview(text: string, maxLength = 118): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatMissingDetailPrompt(question?: string): string | undefined {
  const trimmed = question?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[?.!]+$/, '').trim();
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
  | 'safe_rewrite'
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

interface SuggestedWordingOption {
  id: string;
  label: string;
  helper: string;
  text: string;
  isRecommended: boolean;
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

  const missingDetailPrompt = formatMissingDetailPrompt(topClarifyingQuestion);
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
      body: missingDetailPrompt
        ? `${sectionContext ? `${sectionContext} ` : ''}I can keep this honest right now by rewriting it conservatively. If you want to strengthen it later, the most helpful extra detail would be: ${missingDetailPrompt}.`
        : `${sectionContext ? `${sectionContext} ` : ''}I can keep this honest right now by rewriting it conservatively, then strengthen it later only if we confirm more detail.`,
      actionLabel: 'Show safest version',
      action: 'safe_rewrite',
    };
  }

  if (nextBestAction === 'answer') {
    return {
      title: 'Best first move',
      body: missingDetailPrompt
        ? `${sectionContext ? `${sectionContext} ` : ''}I can give you a safe version now, and this is the one detail that would make it stronger later: ${missingDetailPrompt}.`
        : `${sectionContext ? `${sectionContext} ` : ''}I can give you a safe version now, then we can strengthen it later if needed.`,
      actionLabel: 'Show safe version',
      action: 'safe_rewrite',
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

function buildMissingSummary(args: {
  missingDetail?: string;
  reviewState: ResumeReviewState;
  nextBestAction?: NextBestAction;
  topClarifyingQuestion?: string;
  lineLabel: string;
}): string {
  const { missingDetail, reviewState, nextBestAction, topClarifyingQuestion, lineLabel } = args;
  if (missingDetail?.trim()) return missingDetail.trim();
  const missingDetailPrompt = formatMissingDetailPrompt(topClarifyingQuestion);

  switch (nextBestAction) {
    case 'answer':
      return missingDetailPrompt
        ? `One concrete detail is still missing. The most helpful extra detail would be: ${missingDetailPrompt}.`
        : `One concrete detail is still missing before this ${lineLabel} is safe to keep.`;
    case 'quantify':
      return `A number, budget, team size, timeline, or business result so this ${lineLabel} feels concrete.`;
    case 'confirm':
      return `A safer version of the claim unless the stronger wording is exactly true.`;
    case 'tighten':
      return `A sharper connection between what you did and why this role should care.`;
    case 'accept':
      return `Nothing major. We can keep this version if it feels honest, or polish the wording one more step.`;
    case 'remove':
      return `A real reason to keep this ${lineLabel}. If it does not hold up, it should come out.`;
    default:
      break;
  }

  if (reviewState === 'code_red') {
    return missingDetailPrompt
      ? `We still need one real detail before this line is safe. The most helpful extra detail would be: ${missingDetailPrompt}.`
      : `We still need one real detail before this line is safe.`;
  }
  if (reviewState === 'confirm_fit') {
    return 'A safer way to phrase the claim unless the stronger version is definitely true.';
  }
  if (reviewState === 'strengthen') {
    return `A clearer scope marker, business result, or stronger wording for this ${lineLabel}.`;
  }
  return 'A little more clarity so the line lands faster.';
}

function buildRecommendationSummary(args: {
  reviewState: ResumeReviewState;
  nextBestAction?: NextBestAction;
  lineLabel: string;
  recommendedBullet?: string;
  topClarifyingQuestion?: string;
  hasPriorClarifications: boolean;
}): string {
  const { reviewState, nextBestAction, lineLabel, recommendedBullet, topClarifyingQuestion, hasPriorClarifications } = args;
  const missingDetailPrompt = formatMissingDetailPrompt(topClarifyingQuestion);

  if (hasPriorClarifications) {
    return `I recommend reusing the detail you already confirmed and turning it into a stronger ${lineLabel} instead of starting from scratch.`;
  }

  if (recommendedBullet?.trim()) {
    if (reviewState === 'confirm_fit' || nextBestAction === 'confirm') {
      return `I recommend the middle-ground version below. It gets you closer without overstating your experience.`;
    }
    if (reviewState === 'code_red' || nextBestAction === 'answer') {
      return `I can improve this line now, but I still need one real detail before I would use a stronger version.`;
    }
    return `I recommend the wording below. It is the clearest version based on the evidence we already have.`;
  }

  if (nextBestAction === 'quantify') {
    return 'I recommend adding a defensible number or scope marker so the business impact is obvious.';
  }
  if (nextBestAction === 'tighten') {
    return 'I recommend tightening the sentence so the job fit is obvious right away.';
  }
  if (missingDetailPrompt) {
    return `I can get closer once we confirm one more detail: ${missingDetailPrompt}.`;
  }

  return `I recommend starting with a cleaner version of this ${lineLabel}, then adjusting the wording until it feels exactly right.`;
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
    ...alternatives.map((alternative) => alternative.text),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const uniqueTexts: string[] = [];
  optionTexts.forEach((value) => {
    if (!uniqueTexts.some((candidate) => candidate.trim().toLowerCase() === value.trim().toLowerCase())) {
      uniqueTexts.push(value.trim());
    }
  });

  const trimmedPrimary = primarySuggestion?.trim().toLowerCase();
  const recommendedIndex = trimmedPrimary
    ? Math.max(0, uniqueTexts.findIndex((value) => value.trim().toLowerCase() === trimmedPrimary))
    : Math.min(uniqueTexts.length - 1, 1);

  const selected = uniqueTexts.slice(0, 3);

  return selected.map((text, index) => {
    const alternative = alternatives.find((candidate) => candidate.text.trim().toLowerCase() === text.trim().toLowerCase());
    const isRecommended = index === recommendedIndex;
    const label = (() => {
      if (selected.length === 1) return 'Recommended version';
      if (selected.length === 2) return index === 0 ? 'Safer version' : 'Recommended version';
      return index === 0 ? 'Safer version' : index === 1 ? 'Recommended version' : 'Stronger version';
    })();
    let helper = index === 0
      ? 'Closest to what you already have'
      : alternative?.angle === 'metric'
        ? 'Adds clearer business impact'
        : alternative?.angle === 'scope'
          ? 'Shows more scale or leadership scope'
          : alternative?.angle === 'impact'
            ? 'Shows the business outcome more directly'
            : 'Another clear way to say it';

    if (isRecommended) {
      helper = 'Recommended';
    }

    return {
      id: `${label}-${text.slice(0, 24)}`,
      label,
      helper,
      text,
      isRecommended,
    };
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
  showCloseButton = true,
  isAIEnhanced,
  onBulletEnhance,
}: BulletCoachingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoReuseRef = useRef<string | null>(null);

  // ── Internal state ─────────────────────────────────────────────────────────
  const [enhanceAction, setEnhanceAction] = useState<string | null>(null);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showCustomEdit, setShowCustomEdit] = useState(false);
  const [showAdvancedAI, setShowAdvancedAI] = useState(false);
  const [showAlternativeOptions, setShowAlternativeOptions] = useState(false);
  const [showRelatedSuggestions, setShowRelatedSuggestions] = useState(false);
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
  const chatSuggestedLanguage = latestAssistant?.suggestedLanguage
    ?? itemState?.resolvedLanguage
    ?? chatContext.recommendedBullet
    ?? null;

  // ── Determine the currently displayed suggestion ───────────────────────────
  const primarySuggestion = enhanceResult?.enhancedBullet ?? chatSuggestedLanguage ?? alternatives[0]?.text ?? null;
  const primaryRequirement = requirements[0];
  const resolvedSourceEvidence = sourceEvidence ?? chatContext.sourceEvidence;
  const lineLabel = getLineLabel(chatContext.lineKind);
  const coachTitle = chatContext.sectionLabel ?? `This ${lineLabel}`;
  const topClarifyingQuestion = chatContext.clarifyingQuestions?.[0]?.trim();
  const topClarifyingDetail = formatMissingDetailPrompt(topClarifyingQuestion);
  const priorClarifications = (chatContext.priorClarifications ?? []).slice(0, 2);

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

  // ── Revert to original evidence text ──────────────────────────────────────
  const handleRevertToOriginal = useCallback(() => {
    if (!evidenceFound.trim()) return;
    onApplyToResume(section, bulletIndex, evidenceFound.trim(), applyMetadata());
    onClose();
  }, [applyMetadata, evidenceFound, onApplyToResume, onClose, section, bulletIndex]);

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
    bulletText,
    chatContext,
    evidenceFound,
    gapChat,
    chatKey,
    isChatLoading,
    lineLabel,
    primaryRequirement,
    requirements,
    resolvedSourceEvidence,
    reviewState,
  ]);

  // ── Derived display flags ─────────────────────────────────────────────────
  const isCodeRedNoEvidence =
    reviewState === 'code_red' && !evidenceFound.trim() && alternatives.length === 0 && !chatSuggestedLanguage;
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
  const missingSummary = buildMissingSummary({
    missingDetail: chatContext.missingDetail,
    reviewState,
    nextBestAction,
    topClarifyingQuestion,
    lineLabel,
  });
  const recommendationSummary = buildRecommendationSummary({
    reviewState,
    nextBestAction,
    lineLabel,
    recommendedBullet: primarySuggestion,
    topClarifyingQuestion,
    hasPriorClarifications: priorClarifications.length > 0,
  });
  const suggestedOptions = buildSuggestedWordingOptions({
    bulletText,
    primarySuggestion,
    alternatives,
  });
  const featuredOption = suggestedOptions.find((option) => option.isRecommended) ?? suggestedOptions[0] ?? null;
  const alternateOptions = featuredOption
    ? suggestedOptions.filter((option) => option.id !== featuredOption.id)
    : [];

  const handleBestFirstMove = useCallback(() => {
    switch (bestFirstMove?.action) {
      case 'focus_question':
        handleGenerateSafeRewrite();
        break;
      case 'safe_rewrite':
        handleGenerateSafeRewrite();
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
    handleGenerateSafeRewrite,
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
      data-testid="bullet-coaching-panel"
      tabIndex={-1}
      className="panel-surface mt-3 space-y-3 p-3 focus:outline-none sm:p-4"
      style={{
        animation: 'fade-slide-in 200ms ease-out forwards',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: 'var(--text-soft)' }}
          >
            Resume Coach
          </p>
          <div
            className="mt-2 rounded-2xl px-3.5 py-3"
            style={{
              background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.8), rgba(248, 250, 252, 0.9))',
              border: '1px solid rgba(203, 213, 225, 0.58)',
              boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              Working on {coachTitle}
            </p>
            <p className="mt-1.5 text-[15px] leading-6 text-[var(--text-strong)]">
              {truncatePreview(bulletText, 148)}
            </p>
            <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--text-muted)' }}>
              I will help you strengthen this section one requirement at a time, with wording you can use immediately.
            </p>
          </div>
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2"
            style={{ color: 'var(--text-soft)' }}
            aria-label="Close resume coach"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isAIEnhanced && evidenceFound.trim().length > 0 && evidenceFound.trim() !== bulletText.trim() && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: '1px solid rgba(203, 213, 225, 0.52)',
          }}
        >
          <div
            className="px-3.5 py-3"
            style={{
              background: 'rgba(248, 250, 252, 0.92)',
              borderBottom: '1px solid rgba(203, 213, 225, 0.40)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
              Original
            </p>
            <p
              className="mt-1.5 text-sm leading-relaxed line-through"
              style={{ color: 'var(--text-soft)' }}
            >
              {evidenceFound.trim()}
            </p>
          </div>
          <div
            className="px-3.5 py-3"
            style={{ background: 'rgba(239, 246, 255, 0.72)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--badge-blue-text)' }}>
              AI Enhanced
            </p>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--text-strong)' }}>
              {bulletText}
            </p>
          </div>
          <div
            className="flex items-center gap-2 px-3.5 py-2.5"
            style={{
              background: 'rgba(255, 255, 255, 0.88)',
              borderTop: '1px solid rgba(203, 213, 225, 0.40)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                background: 'var(--btn-primary-bg)',
                border: '1px solid var(--btn-primary-border)',
                color: 'var(--btn-primary-text)',
              }}
            >
              Accept AI Version
            </button>
            <button
              type="button"
              onClick={handleRevertToOriginal}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{
                borderColor: 'var(--line-soft)',
                color: 'var(--text-soft)',
                background: 'transparent',
              }}
            >
              Revert to Original
            </button>
          </div>
        </div>
      )}

      {primaryRequirement && (
        <BulletContextHeader
          requirement={primaryRequirement}
          requirements={chatContext.relatedRequirements}
          requirementSource={requirementSource}
          evidenceFound={evidenceFound}
          sourceEvidence={resolvedSourceEvidence}
          missingSummary={missingSummary}
          reviewState={reviewState}
          proofLevel={proofLevel}
          framingGuardrail={framingGuardrail}
          nextBestAction={nextBestAction}
        />
      )}

      <div
        className="rounded-2xl px-3.5 py-3.5"
        style={{
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(248, 250, 252, 0.92))',
          border: '1px solid rgba(203, 213, 225, 0.52)',
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--text-soft)' }}
              >
                My recommendation
              </p>
              <p className="mt-1.5 text-[14px] leading-6" style={{ color: 'var(--text-strong)' }}>
                {recommendationSummary}
              </p>
              {priorClarifications.length > 0 && (
                <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--text-soft)' }}>
                  I am also using this earlier detail you confirmed: &ldquo;{priorClarifications[0].userInput}&rdquo;
                </p>
              )}
              {topClarifyingDetail && !priorClarifications.length && !featuredOption && (
                <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--text-soft)' }}>
                  If you want to strengthen this later, the extra detail I would want is: {topClarifyingDetail}.
                </p>
              )}
            </div>
            {bestFirstMove?.actionLabel && (priorClarifications.length > 0 || isCodeRedNoEvidence || !suggestedOptions.length) && (
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

          {featuredOption && !isCodeRedNoEvidence && (
            <>
              <div
                className="rounded-xl border px-3 py-3"
                style={{
                  borderColor: featuredOption.isRecommended ? 'rgba(59, 130, 246, 0.35)' : 'rgba(203, 213, 225, 0.52)',
                  background: featuredOption.isRecommended
                    ? 'linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(255, 255, 255, 0.98))'
                    : 'rgba(255, 255, 255, 0.82)',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                        Recommended wording
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                        style={{
                          background: featuredOption.isRecommended ? 'var(--badge-blue-bg)' : 'rgba(241, 245, 249, 0.88)',
                          color: featuredOption.isRecommended ? 'var(--badge-blue-text)' : 'var(--text-soft)',
                        }}
                      >
                        {featuredOption.helper}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-strong)]">
                      {featuredOption.text}
                    </p>
                    <p className="mt-2 text-[12px] leading-5" style={{ color: 'var(--text-muted)' }}>
                      Start here. If it feels true, use it. If not, you can reveal the safer and stronger versions below.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleAcceptSuggestion(featuredOption.text)}
                      disabled={isEnhancing || isChatLoading}
                      className={cn(
                        'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                        (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
                      )}
                      style={{
                        background: featuredOption.isRecommended ? 'var(--btn-primary-bg)' : 'var(--surface-elevated)',
                        border: featuredOption.isRecommended ? '1px solid var(--btn-primary-border)' : '1px solid var(--line-soft)',
                        color: featuredOption.isRecommended ? 'var(--btn-primary-text)' : 'var(--text-strong)',
                      }}
                    >
                      Use this version
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditDraft(featuredOption.text);
                        setShowCustomEdit(true);
                      }}
                      disabled={isEnhancing || isChatLoading}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
                      )}
                      style={{
                        borderColor: 'var(--line-soft)',
                        color: 'var(--text-strong)',
                        background: 'rgba(255, 255, 255, 0.82)',
                      }}
                    >
                      Adjust this version
                    </button>
                  </div>
                </div>
              </div>

              {alternateOptions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAlternativeOptions((current) => !current)}
                  className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-xs font-medium hover:text-[var(--text-strong)]"
                  style={{ color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.82)' }}
                >
                  {showAlternativeOptions ? 'Hide safer and stronger versions' : 'Show safer and stronger versions'}
                </button>
              )}

              {showAlternativeOptions && alternateOptions.map((option) => (
                <div
                  key={option.id}
                  className="rounded-xl border px-3 py-3"
                  style={{
                    borderColor: option.isRecommended ? 'rgba(59, 130, 246, 0.35)' : 'rgba(203, 213, 225, 0.52)',
                    background: option.isRecommended
                      ? 'linear-gradient(180deg, rgba(239, 246, 255, 0.92), rgba(255, 255, 255, 0.98))'
                      : 'rgba(255, 255, 255, 0.82)',
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                          {option.label}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]"
                          style={{
                            background: option.isRecommended ? 'var(--badge-blue-bg)' : 'rgba(241, 245, 249, 0.88)',
                            color: option.isRecommended ? 'var(--badge-blue-text)' : 'var(--text-soft)',
                          }}
                        >
                          {option.helper}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-strong)]">
                        {option.text}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(option.text)}
                        disabled={isEnhancing || isChatLoading}
                        className={cn(
                          'rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                          (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
                        )}
                        style={{
                          background: option.isRecommended ? 'var(--btn-primary-bg)' : 'var(--surface-elevated)',
                          border: option.isRecommended ? '1px solid var(--btn-primary-border)' : '1px solid var(--line-soft)',
                          color: option.isRecommended ? 'var(--btn-primary-text)' : 'var(--text-strong)',
                        }}
                      >
                        Use this version
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditDraft(option.text);
                          setShowCustomEdit(true);
                        }}
                        disabled={isEnhancing || isChatLoading}
                        className={cn(
                          'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                          (isEnhancing || isChatLoading) && 'opacity-50 cursor-not-allowed',
                        )}
                        style={{
                          borderColor: 'var(--line-soft)',
                          color: 'var(--text-strong)',
                          background: 'rgba(255, 255, 255, 0.82)',
                        }}
                      >
                        Adjust this version
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 4. Optional advanced AI actions */}
      {!isCodeRedNoEvidence && onBulletEnhance && (
        <div className="rounded-xl border border-[var(--line-soft)] bg-[var(--surface-0)] px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-soft)]">
                More AI help
              </p>
              <p className="mt-1 text-[12px] leading-5 text-[var(--text-soft)]">
                If none of the suggested versions feel right, I can take another angle.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedAI((current) => !current)}
              className="rounded-lg border border-[var(--line-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-soft)] transition-colors hover:bg-[var(--surface-elevated)] hover:text-[var(--text-strong)]"
            >
              {showAdvancedAI ? 'Hide extra AI help' : 'Show extra AI help'}
            </button>
          </div>
          {showAdvancedAI && (
            <div className="mt-3">
              <EnhanceButtonBar
                onEnhance={handleEnhance}
                isEnhancing={isEnhancing}
                activeAction={enhanceAction}
                disabled={isChatLoading}
                lineKind={chatContext.lineKind}
                sectionLabel={chatContext.sectionLabel}
              />
            </div>
          )}
        </div>
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
            I will keep this conservative first. If you later want to make it stronger, the most helpful extra detail would be around{' '}
            <span
              className="font-medium"
              style={{ color: 'var(--text-strong)' }}
            >
              {primaryRequirement ?? 'this requirement'}
            </span>
            .
          </p>
          {topClarifyingDetail && (
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: 'var(--text-soft)' }}
            >
              If you ever want a stronger version, the extra detail I would want is: {topClarifyingDetail}.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerateSafeRewrite}
              disabled={isChatLoading}
              className={cn(
                'min-h-[40px] rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2',
                isChatLoading && 'opacity-40 cursor-not-allowed',
              )}
              style={{
                background: 'var(--btn-primary-bg)',
                color: 'var(--btn-primary-text)',
                border: '1px solid var(--btn-primary-border)',
              }}
              aria-label="Generate the safest version"
            >
              {isChatLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Show safest version'
              )}
            </button>
            {!showCustomEdit && (
              <button
                type="button"
                onClick={handleWriteMyOwn}
                disabled={isChatLoading}
                className={cn(
                  'min-h-[40px] rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                  isChatLoading && 'opacity-40 cursor-not-allowed',
                )}
                style={{
                  borderColor: 'var(--line-soft)',
                  color: 'var(--text-soft)',
                  background: 'transparent',
                }}
              >
                Write my own version
              </button>
            )}
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
                Also improve nearby lines
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                This same detail can also improve {relatedSuggestionTargets.length} other {relatedSuggestionTargets.length === 1 ? 'line' : 'lines'}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRelatedSuggestions((current) => !current)}
                className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  borderColor: 'var(--line-soft)',
                  color: 'var(--text-strong)',
                  background: 'var(--surface-elevated)',
                }}
              >
                {showRelatedSuggestions ? 'Hide nearby lines' : 'Show nearby lines'}
              </button>
              {showRelatedSuggestions && relatedSuggestionTargets.length > 1 && (
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
          </div>

          {showRelatedSuggestions && (
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
          )}
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
              Use recommended version
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
              Tweak recommended
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
              Write my version
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
