/**
 * V2ResumeScreen — Main screen for the v2 resume pipeline
 *
 * Two states:
 *   1. Intake — two-field form (resume + JD)
 *   2. Streaming — accumulating output display with inline AI editing + live scoring
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react';
import { useV2Pipeline } from '@/hooks/useV2Pipeline';
import { useInlineEdit, resumeToPlainText } from '@/hooks/useInlineEdit';
import { useLiveScoring } from '@/hooks/useLiveScoring';
import { useGapChat } from '@/hooks/useGapChat';
import { useFinalReviewChat } from '@/hooks/useFinalReviewChat';
import { usePostReviewPolish } from '@/hooks/usePostReviewPolish';
import { useBulletEnhance } from '@/hooks/useBulletEnhance';
import { GlassButton } from '../GlassButton';
import { V2IntakeForm } from './V2IntakeForm';
import { V2StreamingDisplay } from './V2StreamingDisplay';
import { scrollToAndFocusTarget } from './useStrategyThread';
import type {
  ClarificationMemoryEntry,
  FinalReviewChatContext,
  ResumeDraft,
  GapCoachingResponse,
  GapChatContext,
  GapChatRelatedLineCandidate,
  GapChatTargetInput,
  MasterPromotionItem,
  ResumeReviewState,
  V2PersistedDraftState,
} from '@/types/resume-v2';
import { normalizeRequirement } from './utils/coaching-actions';
import { findResumeTargetForFinalReviewConcern } from './utils/final-review-target';
import { API_BASE } from '@/lib/api';
import { useHiringManagerReview } from '@/hooks/useHiringManagerReview';
import type { HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import { useToast } from '@/components/Toast';
import { getPromotableResumeItems } from '@/lib/master-resume-promotion';
import { trackProductEvent } from '@/lib/product-telemetry';
import { normalizeResumeDraft } from '@/lib/normalize-resume-draft';
import { extractClarificationMemory, mergeClarificationMemory } from '@/lib/resume-clarification-memory';
import { resumeDraftToFinalResume } from '@/lib/resume-v2-export';
import {
  addOrEnableAIHighlightsSection,
  moveResumeSection,
  removeResumeCustomSection,
  setResumeSectionEnabled,
} from '@/lib/resume-section-plan';
import { DEFAULT_TEMPLATE_ID } from '@/lib/export-templates';
import {
  buildAuthScopedStorageKey,
  decodeUserIdFromAccessToken,
  readJsonFromLocalStorage,
  removeLocalStorageKey,
  writeJsonToLocalStorage,
} from '@/lib/auth-scoped-storage';

type MasterResumeSaveMode = 'session_only' | 'master_resume';

interface MasterResumeSaveResult {
  success: boolean;
  message: string;
  resumeId?: string;
}

interface V2ResumeScreenProps {
  accessToken: string | null;
  onBack: () => void;
  initialResumeText?: string;
  initialJobUrl?: string;
  onLoadMasterResume?: () => Promise<string | null>;
  /** Load a completed V2 session from history */
  initialSessionId?: string;
  onSyncToMasterResume?: (
    draft: ResumeDraft,
    options?: {
      sourceSessionId?: string | null;
      companyName?: string;
      jobTitle?: string;
      atsScore?: number;
      promotionItems?: MasterPromotionItem[];
      clarificationMemory?: ClarificationMemoryEntry[];
    },
  ) => Promise<MasterResumeSaveResult>;
}

const V2_DRAFT_STORAGE_NAMESPACE = 'resume-agent:v2-draft';

function v2DraftStorageKey(sessionId: string, userId: string | null): string {
  return buildAuthScopedStorageKey(V2_DRAFT_STORAGE_NAMESPACE, userId, sessionId);
}

function legacyV2DraftStorageKey(sessionId: string): string {
  return `${V2_DRAFT_STORAGE_NAMESPACE}:${sessionId}`;
}

function readLocalDraftState(sessionId: string, userId: string | null): V2PersistedDraftState | null {
  return readJsonFromLocalStorage<V2PersistedDraftState>(v2DraftStorageKey(sessionId, userId));
}

function writeLocalDraftState(sessionId: string, userId: string | null, draftState: V2PersistedDraftState | null) {
  const scopedKey = v2DraftStorageKey(sessionId, userId);
  if (draftState === null) {
    removeLocalStorageKey(scopedKey);
    removeLocalStorageKey(legacyV2DraftStorageKey(sessionId));
    return;
  }
  writeJsonToLocalStorage(scopedKey, draftState);
  removeLocalStorageKey(legacyV2DraftStorageKey(sessionId));
}

function extractResumeExcerptForSection(resume: ResumeDraft, section: string | undefined): string {
  if (!section) {
    return resumeToPlainText(resume);
  }

  const sectionLower = section.toLowerCase();

  if (sectionLower.includes('summary')) {
    return `EXECUTIVE SUMMARY:\n${resume.executive_summary.content}`;
  }

  if (sectionLower.includes('accomplishment')) {
    return `SELECTED ACCOMPLISHMENTS:\n${resume.selected_accomplishments.map((item) => `- ${item.content}`).join('\n')}`;
  }

  if (sectionLower.includes('competenc')) {
    return `CORE COMPETENCIES:\n${resume.core_competencies.join(', ')}`;
  }

  const matchingExperience = resume.professional_experience.find((experience) => (
    sectionLower.includes(experience.company.toLowerCase())
      || sectionLower.includes(experience.title.toLowerCase())
  ));

  if (matchingExperience) {
    return [
      `${matchingExperience.title} | ${matchingExperience.company} (${matchingExperience.start_date} - ${matchingExperience.end_date})`,
      matchingExperience.scope_statement,
      ...matchingExperience.bullets.map((bullet) => `- ${bullet.text}`),
    ].join('\n');
  }

  return resumeToPlainText(resume);
}

function parseCustomSectionKey(section: string): string | null {
  return section.startsWith('custom_section:') ? section.slice('custom_section:'.length) : null;
}

function tokenizeForMatching(value: string | undefined): string[] {
  return normalizeRequirement(value ?? '').split(/\s+/).filter(Boolean);
}

function overlapScore(a: string | undefined, b: string | undefined): number {
  const aTokens = new Set(tokenizeForMatching(a));
  const bTokens = new Set(tokenizeForMatching(b));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let shared = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) shared += 1;
  }
  return shared / Math.max(aTokens.size, bTokens.size);
}

function lineKindForSection(section?: string): GapChatContext['lineKind'] {
  if (section === 'executive_summary') return 'summary';
  if (section === 'core_competencies') return 'competency';
  if (section?.startsWith('custom_section:')) return 'custom_line';
  return 'bullet';
}

function buildRelatedLineCandidates(args: {
  resume: ResumeDraft | null;
  target: GapChatTargetInput;
  relatedRequirements: string[];
}): GapChatRelatedLineCandidate[] {
  const { resume, target, relatedRequirements } = args;
  if (!resume) return [];

  const normalizedRequirements = Array.from(new Set(
    relatedRequirements
      .map((requirement) => normalizeRequirement(requirement))
      .filter(Boolean),
  ));

  const candidates: GapChatRelatedLineCandidate[] = [];
  const currentSection = target.section;
  const currentIndex = typeof target.index === 'number' ? target.index : undefined;
  const currentText = target.lineText?.trim() ?? '';

  const pushCandidate = (candidate: GapChatRelatedLineCandidate) => {
    const sameSection = candidate.section === currentSection;
    const sameIndex = typeof currentIndex === 'number' && candidate.index === currentIndex;
    const sameText = candidate.lineText.trim() === currentText;
    if (sameSection && (sameIndex || sameText)) return;
    if (!candidate.lineText.trim()) return;
    candidates.push(candidate);
  };

  if (resume.executive_summary.content.trim()) {
    pushCandidate({
      id: 'executive_summary:0',
      section: 'executive_summary',
      index: 0,
      lineText: resume.executive_summary.content.trim(),
      lineKind: 'summary',
      label: 'Executive Summary',
      requirements: resume.executive_summary.addresses_requirements ?? [],
      evidenceFound: resume.executive_summary.content.trim(),
    });
  }

  resume.core_competencies.forEach((item, index) => {
    if (!item.trim()) return;
    pushCandidate({
      id: `core_competencies:${index}`,
      section: 'core_competencies',
      index,
      lineText: item.trim(),
      lineKind: 'competency',
      label: 'Core Competencies',
      requirements: [],
      evidenceFound: item.trim(),
    });
  });

  resume.selected_accomplishments.forEach((item, index) => {
    if (!item.content.trim()) return;
    pushCandidate({
      id: `selected_accomplishments:${index}`,
      section: 'selected_accomplishments',
      index,
      lineText: item.content.trim(),
      lineKind: 'bullet',
      label: 'Selected Accomplishments',
      requirements: item.addresses_requirements ?? [],
      evidenceFound: item.evidence_found,
      workItemId: item.work_item_id,
    });
  });

  resume.professional_experience.forEach((experience, experienceIndex) => {
    experience.bullets.forEach((bullet, bulletIndex) => {
      if (!bullet.text.trim()) return;
      pushCandidate({
        id: `professional_experience:${experienceIndex * 100 + bulletIndex}`,
        section: 'professional_experience',
        index: experienceIndex * 100 + bulletIndex,
        lineText: bullet.text.trim(),
        lineKind: 'bullet',
        label: `${experience.title} · ${experience.company}`,
        requirements: bullet.addresses_requirements ?? [],
        evidenceFound: bullet.evidence_found,
        workItemId: bullet.work_item_id,
      });
    });
  });

  for (const section of resume.custom_sections ?? []) {
    const sectionKey = `custom_section:${section.id}`;
    if (section.summary?.trim()) {
      pushCandidate({
        id: `${sectionKey}:-1`,
        section: sectionKey,
        index: -1,
        lineText: section.summary.trim(),
        lineKind: 'section_summary',
        label: section.title,
        requirements: [],
        evidenceFound: section.summary.trim(),
      });
    }
    section.lines.forEach((line, index) => {
      if (!line.trim()) return;
      pushCandidate({
        id: `${sectionKey}:${index}`,
        section: sectionKey,
        index,
        lineText: line.trim(),
        lineKind: 'custom_line',
        label: section.title,
        requirements: [],
        evidenceFound: line.trim(),
      });
    });
  }

  return candidates
    .map((candidate) => {
      const workItemMatch = target.workItemId && candidate.workItemId === target.workItemId ? 1 : 0;
      const requirementScore = candidate.requirements.reduce((best, requirement) => (
        Math.max(
          best,
          ...normalizedRequirements.map((relatedRequirement) => overlapScore(requirement, relatedRequirement)),
        )
      ), 0);
      const textScore = currentText ? overlapScore(candidate.lineText, currentText) * 0.25 : 0;
      const evidenceScore = target.evidenceFound ? overlapScore(candidate.evidenceFound, target.evidenceFound) * 0.2 : 0;

      return {
        candidate,
        score: workItemMatch ? 1 : Math.max(requirementScore, textScore, evidenceScore),
      };
    })
    .filter(({ score }) => score >= 0.18)
    .sort((left, right) => right.score - left.score || left.candidate.label.localeCompare(right.candidate.label))
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

export function V2ResumeScreen({ accessToken, onBack, initialResumeText, initialJobUrl, onLoadMasterResume, initialSessionId, onSyncToMasterResume }: V2ResumeScreenProps) {
  const { data, isConnected, isComplete, isStarting, error, start, reset, loadSession, saveDraftState, integrateKeyword } = useV2Pipeline(accessToken);
  const { addToast } = useToast();
  const storageUserId = useMemo(() => decodeUserIdFromAccessToken(accessToken), [accessToken]);

  // Track the editable resume separately — starts as the pipeline output,
  // then gets mutated by inline edits
  const [editableResume, setEditableResume] = useState<ResumeDraft | null>(null);

  // The resume to use: user-edited version takes precedence over pipeline output
  const currentResume = useMemo(
    () => normalizeResumeDraft(editableResume ?? data.assembly?.final_resume ?? data.resumeDraft ?? null),
    [editableResume, data.assembly?.final_resume, data.resumeDraft],
  );

  // Store inputs for inline edit context and re-runs
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [previousResume, setPreviousResume] = useState<ResumeDraft | null>(null);
  // Job URL used for the current pipeline — populated when the JD input is a URL
  const [activeJobUrl, setActiveJobUrl] = useState<string | null>(initialJobUrl ?? null);

  const {
    pendingEdit, isEditing, editError, undoCount, redoCount,
    requestEdit, acceptEdit: rawAcceptEdit, rejectEdit, undo, redo, resetHistory,
  } = useInlineEdit(accessToken, data.sessionId, currentResume, jobDescription, setEditableResume);
  const promotableMasterItems = useMemo(() => getPromotableResumeItems(currentResume), [currentResume]);
  const [selectedMasterPromotionIds, setSelectedMasterPromotionIds] = useState<string[]>([]);

  // Live ATS scoring
  const { scores: liveScores, isScoring, setInitialScores } = useLiveScoring(
    accessToken, data.sessionId, jobDescription,
  );

  // Hiring manager review
  const {
    result: hiringManagerResult,
    isLoading: isHiringManagerLoading,
    error: hiringManagerError,
    requestReview: rawRequestReview,
    reset: resetHiringManagerReview,
    hydrateResult: hydrateHiringManagerReview,
  } = useHiringManagerReview(accessToken, data.sessionId);

  // Gap coaching chat
  const gapChat = useGapChat(accessToken, data.sessionId);
  const {
    resetChat: resetGapChat,
    acceptLanguage: acceptGapLanguage,
    clearResolvedLanguage: clearGapResolvedLanguage,
    getSnapshot: getGapChatSnapshot,
    hydrateSnapshot: hydrateGapChatSnapshot,
  } = gapChat;
  const finalReviewChat = useFinalReviewChat(accessToken, data.sessionId);
  const {
    resetChat: resetFinalReviewChat,
    acceptLanguage: acceptFinalReviewLanguage,
    clearResolvedLanguage: clearFinalReviewResolvedLanguage,
    getSnapshot: getFinalReviewChatSnapshot,
    hydrateSnapshot: hydrateFinalReviewChatSnapshot,
  } = finalReviewChat;
  const {
    state: postReviewPolish,
    runPolish,
    hydrateState: hydratePostReviewPolish,
    reset: resetPostReviewPolish,
  } = usePostReviewPolish(accessToken, data.sessionId);

  // Bullet AI enhancement (show_transformation / demonstrate_leadership / connect_to_role / show_accountability)
  const { enhance: bulletEnhance } = useBulletEnhance(accessToken, data.sessionId || null);
  const handleBulletEnhance = useCallback(async (
    action: string,
    bulletText: string,
    requirement: string,
    evidence?: string,
    context?: Partial<GapChatContext>,
  ) => {
    return bulletEnhance(
      action as 'show_transformation' | 'demonstrate_leadership' | 'connect_to_role' | 'show_accountability',
      bulletText,
      requirement,
      evidence,
      undefined,
      context,
    );
  }, [bulletEnhance]);

  const [resolvedFinalReviewConcernIds, setResolvedFinalReviewConcernIds] = useState<string[]>([]);
  const [finalReviewWarningsAcknowledged, setFinalReviewWarningsAcknowledged] = useState(false);
  const [isFinalReviewStale, setIsFinalReviewStale] = useState(false);
  const [finalReviewResumeText, setFinalReviewResumeText] = useState<string | null>(null);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [masterSaveMode, setMasterSaveMode] = useState<MasterResumeSaveMode>('session_only');
  const [isSavingToMaster, setIsSavingToMaster] = useState(false);
  const [masterSaveStatus, setMasterSaveStatus] = useState<{
    tone: 'neutral' | 'success' | 'error';
    message: string;
  }>({
    tone: 'neutral',
    message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
  });
  const [clarificationMemory, setClarificationMemory] = useState<ClarificationMemoryEntry[]>([]);
  const lastMasterSnapshotRef = useRef('');
  const lastPersistedDraftRef = useRef<string>('null');
  const pendingPostReviewPolishRef = useRef<{
    concernId: string | null;
  } | null>(null);
  const lastCompletedFinalReviewSignatureRef = useRef<string | null>(null);
  const selectedPromotableItems = useMemo(() => (
    promotableMasterItems.filter((item) => selectedMasterPromotionIds.includes(item.id))
  ), [promotableMasterItems, selectedMasterPromotionIds]);
  const unresolvedCriticalConcernCount = useMemo(() => (
    hiringManagerResult?.concerns.filter((concern) => (
      concern.severity === 'critical' && !resolvedFinalReviewConcernIds.includes(concern.id)
    )).length ?? 0
  ), [hiringManagerResult, resolvedFinalReviewConcernIds]);

  // DOCX download from top bar
  const handleTopBarDocx = useCallback(async () => {
    if (!currentResume) return;
    setIsExportingDocx(true);
    try {
      const { exportDocx } = await import('@/lib/export-docx');
      const finalResume = resumeDraftToFinalResume(currentResume, {
        companyName: data.jobIntelligence?.company_name,
        jobTitle: data.jobIntelligence?.role_title,
        atsScore: postReviewPolish.result?.ats_score ?? liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? undefined,
      });
      await exportDocx(finalResume, DEFAULT_TEMPLATE_ID);
    } catch (err) {
      console.error('DOCX export failed:', err);
      addToast({ type: 'error', message: 'Export failed. Please try again.' });
    } finally {
      setIsExportingDocx(false);
    }
  }, [currentResume, data.jobIntelligence, data.assembly?.scores.ats_match, liveScores?.ats_score, postReviewPolish.result?.ats_score, addToast]);

  const gapChatSnapshot = getGapChatSnapshot();
  const finalReviewChatSnapshot = getFinalReviewChatSnapshot();
  const finalReviewConcernTopics = useMemo(() => (
    Object.fromEntries(
      (hiringManagerResult?.concerns ?? []).map((concern) => [
        concern.id.trim().toLowerCase(),
        concern.observation,
      ]),
    )
  ), [hiringManagerResult]);
  const clarificationTopicFamilies = useMemo(() => {
    const gapCoachingPolicies = new Map(
      (data.gapCoachingCards ?? [])
        .filter((card) => card.coaching_policy)
        .map((card) => [
          normalizeRequirement(card.requirement),
          {
            primaryFamily: card.coaching_policy?.primaryFamily ?? null,
            families: card.coaching_policy?.families ?? [],
          },
        ]),
    );

    const topicFamilies: Record<string, { primaryFamily?: string | null; families?: string[] }> = {};

    for (const [normalizedRequirement, families] of gapCoachingPolicies.entries()) {
      topicFamilies[normalizedRequirement] = families;
    }

    for (const concern of hiringManagerResult?.concerns ?? []) {
      const normalizedTopic = normalizeRequirement(concern.observation);
      if (!normalizedTopic) continue;
      const relatedFamilies = concern.related_requirement
        ? gapCoachingPolicies.get(normalizeRequirement(concern.related_requirement))
        : undefined;
      if (!relatedFamilies) continue;
      topicFamilies[normalizedTopic] = relatedFamilies;
    }

    return topicFamilies;
  }, [data.gapCoachingCards, hiringManagerResult]);
  const currentClarificationMemory = mergeClarificationMemory(
    clarificationMemory,
    extractClarificationMemory({
      gapChatSnapshot,
      finalReviewChatSnapshot,
      currentResumeText: currentResume ? resumeToPlainText(currentResume) : '',
      finalReviewConcernTopics,
      topicFamilies: clarificationTopicFamilies,
    }),
  );

  // Build context for per-item gap chat — memoized factory
  const buildChatContext = useCallback((target: string | GapChatTargetInput): GapChatContext => {
    const ji = data.jobIntelligence;
    const ci = data.candidateIntelligence;
    const ga = data.gapAnalysis;
    const gc = data.gapCoachingCards;
    const workItems = data.requirementWorkItems ?? ga?.requirement_work_items ?? [];
    const currentTarget = typeof target === 'string'
      ? { requirement: target }
      : target;
    const explicitRequirement = currentTarget.requirement?.trim() ?? '';
    const explicitRequirements = (currentTarget.requirements ?? [])
      .map((requirement) => requirement.trim())
      .filter(Boolean);
    const lineText = currentTarget.lineText?.trim() ?? '';
    const sectionKey = currentTarget.section;
    const lineKind = lineKindForSection(sectionKey);
    const normalized = normalizeRequirement(explicitRequirement || explicitRequirements[0] || '');

    // Find the matching requirement in gap analysis (normalized + fallback)
    const gapReq = normalized
      ? ga?.requirements.find(
      r => normalizeRequirement(r.requirement) === normalized,
    ) ?? ga?.requirements.find(
      r => r.requirement.toLowerCase().includes(normalized) || normalized.includes(r.requirement.toLowerCase()),
    )
      : undefined;

    const relatedWorkItems = workItems
      .map((item) => {
        const requirementScore = normalized
          ? overlapScore(item.requirement, explicitRequirement || explicitRequirements[0])
          : 0;
        const lineScore = lineText
          ? Math.max(
              overlapScore(item.requirement, lineText),
              overlapScore(item.best_evidence_excerpt, lineText),
              ...item.candidate_evidence.map((evidence) => overlapScore(evidence.text, lineText)),
            )
          : 0;
        const explicitMatch = currentTarget.workItemId
          ? item.id === currentTarget.workItemId
          : false;
        const hasRelatedRequirement = explicitRequirements.some((requirement) => (
          normalizeRequirement(item.requirement) === normalizeRequirement(requirement)
        ));

        return {
          item,
          score: explicitMatch
            ? 100
            : hasRelatedRequirement
              ? 10
              : Math.max(requirementScore, lineScore),
        };
      })
      .filter(({ score }) => score >= 0.18)
      .sort((left, right) => right.score - left.score)
      .map(({ item }) => item);
    const workItem = currentTarget.workItemId
      ? workItems.find((item) => item.id === currentTarget.workItemId) ?? relatedWorkItems[0]
      : relatedWorkItems[0];

    // Find JD evidence for this requirement (normalized + fallback)
    const comp = normalized
      ? ji?.core_competencies.find(
      c => normalizeRequirement(c.competency) === normalized,
    ) ?? ji?.core_competencies.find(
      c => c.competency.toLowerCase().includes(normalized) || normalized.includes(c.competency.toLowerCase()),
    )
      : undefined;

    const coachingCard = normalized
      ? gc?.find(
      card => normalizeRequirement(card.requirement) === normalized,
    ) ?? gc?.find(
      card => card.requirement.toLowerCase().includes(normalized) || normalized.includes(card.requirement.toLowerCase()),
    )
      : undefined;

    const coachingPolicy = coachingCard?.coaching_policy ?? gapReq?.strategy?.coaching_policy;

    const relatedRequirements = Array.from(new Set([
      ...explicitRequirements,
      explicitRequirement,
      ...relatedWorkItems.map((item) => item.requirement),
    ].filter(Boolean)));
    const relatedLineCandidates = buildRelatedLineCandidates({
      resume: currentResume,
      target: currentTarget,
      relatedRequirements,
    });

    const sectionLabel = (() => {
      if (sectionKey === 'executive_summary') return 'Executive Summary';
      if (sectionKey === 'core_competencies') return 'Core Competencies';
      const customSectionId = parseCustomSectionKey(sectionKey ?? '');
      if (customSectionId) {
        const customSection = currentResume?.custom_sections?.find((section) => section.id === customSectionId);
        return customSection?.title ?? 'Custom Section';
      }
      return 'Resume Line';
    })();

    const sourceEvidenceParts = Array.from(new Set([
      workItem?.source_evidence,
      gapReq?.source_evidence,
      coachingCard?.source_evidence,
      comp?.evidence_from_jd,
      ...relatedWorkItems.map((item) => item.source_evidence),
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

    const evidence = Array.from(new Set([
      ...(gapReq?.evidence ?? []),
      ...(workItem?.candidate_evidence.map((item) => item.text) ?? []),
      ...relatedWorkItems.flatMap((item) => item.candidate_evidence.map((evidenceItem) => evidenceItem.text)),
      currentTarget.evidenceFound && currentTarget.evidenceFound !== lineText ? currentTarget.evidenceFound : '',
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));

    const clarifyingQuestions = Array.from(new Set([
      workItem?.clarifying_question,
      ...relatedWorkItems.map((item) => item.clarifying_question),
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0))).slice(0, 3);

    const normalizedRelatedRequirements = relatedRequirements
      .map((requirement) => normalizeRequirement(requirement))
      .filter(Boolean);
    const currentFamilies = coachingPolicy?.families ?? [];
    const matchedPriorClarifications = currentClarificationMemory
      .map((entry) => {
        const familyOverlap = entry.families?.some((family) => currentFamilies.includes(family)) ?? false;
        const requirementOverlap = normalizedRelatedRequirements.some((requirement) => {
          const topic = normalizeRequirement(entry.topic);
          return topic === requirement || overlapScore(topic, requirement) >= 0.4;
        });
        const textOverlap = lineText ? overlapScore(entry.userInput, lineText) >= 0.32 : false;
        return {
          entry,
          score: familyOverlap ? 10 : requirementOverlap ? 5 : textOverlap ? 2 : 0,
        };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score)
      .map(({ entry }) => entry)
      .slice(0, 2);

    const coachingGoal = (() => {
      if (lineKind === 'summary') {
        return 'Rewrite this executive summary line so it quickly sells role fit, leadership scope, and business relevance.';
      }
      if (lineKind === 'competency') {
        return 'Rewrite this competency as a crisp ATS-friendly keyword phrase, not a full sentence.';
      }
      if (sectionKey?.startsWith('custom_section:')) {
        return sectionKey === 'custom_section:ai_highlights'
          ? 'Sharpen this AI-focused section line so it sounds executive, credible, and aligned to transformation work.'
          : 'Rewrite this custom-section line so it strengthens the section story and stays grounded in real experience.';
      }
      if (currentTarget.reviewState === 'code_red') {
        return 'Find the safest truthful version of this line or surface the one missing detail needed to keep it.';
      }
      if (currentTarget.reviewState === 'strengthen') {
        return 'Make this line more specific, sharper, and more obviously relevant to the role.';
      }
      return 'Improve this resume line while keeping it fully truthful and defensible.';
    })();

    const candidateSummaryParts = [
      ci ? `${ci.career_themes.join(', ')}. ${ci.leadership_scope}. Scale: ${ci.operational_scale}.` : '',
      lineKind === 'summary' && ci?.quantified_outcomes?.length
        ? `Top outcomes: ${ci.quantified_outcomes.slice(0, 3).map((outcome) => `${outcome.outcome} (${outcome.value})`).join(' | ')}.`
        : '',
      lineKind === 'competency' && ci
        ? `Relevant capability areas: ${[...ci.technologies.slice(0, 6), ...ci.industry_depth.slice(0, 3)].filter(Boolean).join(', ')}.`
        : '',
      sectionKey === 'custom_section:ai_highlights' && ci?.ai_readiness
        ? `AI readiness: ${ci.ai_readiness.summary}`
        : '',
    ].filter(Boolean).join(' ');

    return {
      workItemId: workItem?.id,
      evidence,
      currentStrategy: lineText || gapReq?.strategy?.positioning,
      aiReasoning: gapReq?.strategy?.ai_reasoning,
      inferredMetric: gapReq?.strategy?.inferred_metric,
      coachingPolicy,
      jobDescriptionExcerpt: sourceEvidenceParts.length > 0
        ? sourceEvidenceParts.join('\n')
        : ji?.core_competencies.map(c => `${c.competency} (${c.importance})`).join(', ')
          ?? '',
      candidateExperienceSummary: candidateSummaryParts,
      alternativeBullets: coachingCard?.alternative_bullets ?? [],
      primaryRequirement: explicitRequirement || relatedRequirements[0] || lineText,
      requirementSource: workItem?.source ?? gapReq?.source ?? coachingCard?.source,
      sourceEvidence: sourceEvidenceParts[0],
      lineText: lineText || undefined,
      lineKind,
      sectionKey,
      sectionLabel,
      relatedRequirements,
      coachingGoal,
      clarifyingQuestions,
      priorClarifications: matchedPriorClarifications,
      relatedLineCandidates,
    };
  }, [currentClarificationMemory, currentResume, data.jobIntelligence, data.candidateIntelligence, data.gapAnalysis, data.gapCoachingCards, data.requirementWorkItems]);

  // AI assist for gap positioning cards — calls gap-chat with a single-shot prompt
  const handleGapAssist = useCallback(
    async (
      requirement: string,
      classification: string,
      action: 'strengthen' | 'add_metrics' | 'rewrite',
      currentDraft: string,
      evidence: string[],
      aiReasoning?: string,
      signal?: AbortSignal,
    ): Promise<string | null> => {
      if (!accessToken || !data.sessionId) return null;

      const prompts: Record<string, string> = {
        strengthen: `Strengthen this positioning with more impactful verbs and executive voice. Keep all specifics. Current draft: "${currentDraft}"`,
        add_metrics: `Add or strengthen quantified metrics in this positioning. Infer conservatively from the evidence. Current draft: "${currentDraft}"`,
        rewrite: `Completely rewrite this positioning to be more specific and impactful. Preserve all facts and numbers from the evidence. Current draft: "${currentDraft}"`,
      };

      const ctx = buildChatContext(requirement);

      try {
        const response = await fetch(`${API_BASE}/pipeline/${data.sessionId}/gap-chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            requirement,
            classification,
            messages: [{ role: 'user', content: prompts[action] }],
            context: {
              evidence: ctx.evidence.length > 0 ? ctx.evidence : evidence,
              current_strategy: currentDraft,
              ai_reasoning: aiReasoning ?? ctx.aiReasoning,
              inferred_metric: ctx.inferredMetric,
              job_description_excerpt: ctx.jobDescriptionExcerpt,
              candidate_experience_summary: ctx.candidateExperienceSummary,
              coaching_policy: ctx.coachingPolicy,
            },
          }),
          signal,
        });

        if (!response.ok) return null;

        const result = await response.json();
        return result.suggested_resume_language ?? null;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        return null;
      }
    },
    [accessToken, data.sessionId, buildChatContext],
  );

  const buildFinalReviewChatContext = useCallback((concern: HiringManagerConcern): FinalReviewChatContext | null => {
    if (!currentResume || !data.jobIntelligence || !hiringManagerResult) return null;
    const workItems = data.requirementWorkItems ?? data.gapAnalysis?.requirement_work_items ?? [];
    const normalizedRelatedRequirement = concern.related_requirement
      ? normalizeRequirement(concern.related_requirement)
      : null;
    const matchedWorkItem = (
      concern.work_item_id
        ? workItems.find((item) => item.id === concern.work_item_id)
        : undefined
    ) ?? (
      normalizedRelatedRequirement
        ? workItems.find((item) => (
            normalizeRequirement(item.requirement) === normalizedRelatedRequirement
              || item.id === concern.related_requirement
          ))
        : undefined
    );

    return {
      concernId: concern.id,
      workItemId: concern.work_item_id ?? matchedWorkItem?.id,
      concernType: concern.type,
      severity: concern.severity,
      observation: concern.observation,
      whyItHurts: concern.why_it_hurts,
      fixStrategy: concern.fix_strategy,
      requiresCandidateInput: concern.requires_candidate_input,
      clarifyingQuestion: concern.clarifying_question,
      targetSection: concern.target_section,
      relatedRequirement: concern.related_requirement,
      suggestedResumeEdit: concern.suggested_resume_edit,
      roleTitle: data.jobIntelligence.role_title,
      companyName: data.jobIntelligence.company_name,
      jobDescriptionFit: hiringManagerResult.fit_assessment.job_description_fit,
      benchmarkAlignment: hiringManagerResult.fit_assessment.benchmark_alignment,
      businessImpact: hiringManagerResult.fit_assessment.business_impact,
      clarityAndCredibility: hiringManagerResult.fit_assessment.clarity_and_credibility,
      resumeExcerpt: extractResumeExcerptForSection(currentResume, concern.target_section),
    };
  }, [currentResume, data.gapAnalysis?.requirement_work_items, data.jobIntelligence, data.requirementWorkItems, hiringManagerResult]);

  // Seed initial scores from pipeline assembly
  useEffect(() => {
    if (data.assembly) {
      setInitialScores(data.assembly.scores.ats_match);
    }
  }, [data.assembly, setInitialScores]);

  const [attemptedHistoricalSessionKey, setAttemptedHistoricalSessionKey] = useState<string | null>(null);
  const [activeHistoricalSessionKey, setActiveHistoricalSessionKey] = useState<string | null>(null);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  const requestedHistoricalSessionKey = useMemo(() => (
    initialSessionId ? `${storageUserId ?? 'anon'}:${initialSessionId}` : null
  ), [initialSessionId, storageUserId]);

  const resetScreenState = useCallback((options?: { clearInputs?: boolean; clearSessionError?: boolean }) => {
    setEditableResume(null);
    setPreviousResume(null);
    setClarificationMemory([]);
    lastMasterSnapshotRef.current = '';
    lastPersistedDraftRef.current = 'null';
    setMasterSaveMode('session_only');
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
    });
    if (options?.clearInputs) {
      setResumeText('');
      setJobDescription('');
    }
    if (options?.clearSessionError ?? true) {
      setSessionLoadError(null);
    }
    resetHistory();
    resetGapChat();
    resetFinalReviewChat();
    resetHiringManagerReview();
    setResolvedFinalReviewConcernIds([]);
    setFinalReviewWarningsAcknowledged(false);
    setIsFinalReviewStale(false);
    setFinalReviewResumeText(null);
    setSelectedMasterPromotionIds([]);
    resetPostReviewPolish();
  }, [
    resetFinalReviewChat,
    resetGapChat,
    resetHiringManagerReview,
    resetHistory,
    resetPostReviewPolish,
  ]);

  const previousStorageUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const previousStorageUserId = previousStorageUserIdRef.current;
    if (previousStorageUserId === undefined) {
      previousStorageUserIdRef.current = storageUserId;
      return;
    }
    if (previousStorageUserId === storageUserId) return;

    previousStorageUserIdRef.current = storageUserId;
    setAttemptedHistoricalSessionKey(null);
    setActiveHistoricalSessionKey(null);
    reset();
    resetScreenState({ clearInputs: true });
  }, [reset, resetScreenState, storageUserId]);

  useEffect(() => {
    if (!requestedHistoricalSessionKey) {
      if (activeHistoricalSessionKey || attemptedHistoricalSessionKey) {
        setAttemptedHistoricalSessionKey(null);
        setActiveHistoricalSessionKey(null);
        reset();
        resetScreenState({ clearInputs: true });
      }
      return;
    }

    if (!accessToken) {
      setAttemptedHistoricalSessionKey(null);
      setActiveHistoricalSessionKey(null);
      return;
    }

    const requestedSessionId = initialSessionId;
    if (!requestedSessionId) return;

    if (attemptedHistoricalSessionKey === requestedHistoricalSessionKey) return;

    setAttemptedHistoricalSessionKey(requestedHistoricalSessionKey);
    setActiveHistoricalSessionKey(null);
    setSessionLoadError(null);
    reset();
    resetScreenState({ clearInputs: true, clearSessionError: false });

    let cancelled = false;
    void (async () => {
      const result = await loadSession(requestedSessionId);
      if (cancelled) return;

      if (result) {
        const resolvedDraftState = result.draftState ?? readLocalDraftState(requestedSessionId, storageUserId);
        setResumeText(result.resume_text);
        setJobDescription(result.job_description);
        setEditableResume(normalizeResumeDraft(resolvedDraftState?.editable_resume ?? null));
        setClarificationMemory(resolvedDraftState?.clarification_memory ?? []);
        setMasterSaveMode(resolvedDraftState?.master_save_mode ?? 'session_only');
        hydrateGapChatSnapshot(resolvedDraftState?.gap_chat_state ?? null);
        hydrateHiringManagerReview(resolvedDraftState?.final_review_state?.result ?? null);
        setResolvedFinalReviewConcernIds(resolvedDraftState?.final_review_state?.resolved_concern_ids ?? []);
        setFinalReviewWarningsAcknowledged(resolvedDraftState?.final_review_state?.acknowledged_export_warnings ?? false);
        setIsFinalReviewStale(resolvedDraftState?.final_review_state?.is_stale ?? false);
        setFinalReviewResumeText(resolvedDraftState?.final_review_state?.reviewed_resume_text ?? null);
        hydrateFinalReviewChatSnapshot(resolvedDraftState?.final_review_chat_state ?? null);
        hydratePostReviewPolish(resolvedDraftState?.post_review_polish ?? null);
        setSelectedMasterPromotionIds(resolvedDraftState?.master_promotion_state?.selected_item_ids ?? []);
        lastPersistedDraftRef.current = JSON.stringify(resolvedDraftState ?? null);
        setActiveHistoricalSessionKey(requestedHistoricalSessionKey);
        return;
      }

      setSessionLoadError('Failed to load session. It may have expired or belong to a different account.');
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeHistoricalSessionKey,
    attemptedHistoricalSessionKey,
    hydrateFinalReviewChatSnapshot,
    hydrateGapChatSnapshot,
    hydrateHiringManagerReview,
    hydratePostReviewPolish,
    initialSessionId,
    loadSession,
    requestedHistoricalSessionKey,
    reset,
    resetScreenState,
    storageUserId,
  ]);

  const acceptEdit = useCallback((editedText: string) => {
    const acceptedRequirement = pendingEdit?.editContext?.requirement;
    const acceptedOrigin = pendingEdit?.editContext?.origin;
    const acceptedConcernId = pendingEdit?.editContext?.finalReviewConcernId ?? null;
    const candidateInputUsed = pendingEdit?.editContext?.candidateInputUsed ?? false;

    rawAcceptEdit(editedText);
    if (acceptedRequirement) {
      acceptGapLanguage(acceptedRequirement, editedText);
    }
    if (acceptedOrigin === 'final_review' && acceptedConcernId) {
      acceptFinalReviewLanguage(acceptedConcernId, editedText);
      setResolvedFinalReviewConcernIds((previous) => (
        previous.includes(acceptedConcernId) ? previous : [...previous, acceptedConcernId]
      ));
      pendingPostReviewPolishRef.current = { concernId: acceptedConcernId };

      if (candidateInputUsed) {
        addToast({
          type: 'success',
          message: 'Final Review detail applied. Tone and match score are refreshing in the background.',
        });
      }
    }
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
  }, [
    pendingEdit,
    rawAcceptEdit,
    acceptGapLanguage,
    acceptFinalReviewLanguage,
    addToast,
    hiringManagerResult,
  ]);

  const handleDirectBulletEdit = useCallback((section: string, index: number, newText: string) => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;

      if (section === 'executive_summary') {
        return {
          ...base,
          executive_summary: {
            ...base.executive_summary,
            content: newText,
          },
        };
      }

      if (section === 'core_competencies') {
        if (!base.core_competencies[index]) return base;
        return {
          ...base,
          core_competencies: base.core_competencies.map((item, itemIndex) => (
            itemIndex === index ? newText : item
          )),
        };
      }

      if (section === 'selected_accomplishments') {
        if (!base.selected_accomplishments[index]) return base;
        return {
          ...base,
          selected_accomplishments: base.selected_accomplishments.map((item, itemIndex) => (
            itemIndex === index
              ? { ...item, content: newText }
              : item
          )),
        };
      }

      if (section === 'professional_experience') {
        const experienceIndex = Math.floor(index / 100);
        const bulletIndex = index % 100;
        const experience = base.professional_experience[experienceIndex];
        if (!experience?.bullets?.[bulletIndex]) return base;

        return {
          ...base,
          professional_experience: base.professional_experience.map((entry, entryIndex) => (
            entryIndex === experienceIndex
              ? {
                  ...entry,
                  bullets: entry.bullets.map((bullet, currentBulletIndex) => (
                    currentBulletIndex === bulletIndex
                      ? { ...bullet, text: newText }
                      : bullet
                  )),
                }
              : entry
          )),
        };
      }

      const customSectionId = parseCustomSectionKey(section);
      if (customSectionId) {
        const customSections = Array.isArray(base.custom_sections) ? base.custom_sections : [];
        const customSection = customSections.find((item) => item.id === customSectionId);
        if (!customSection) return base;

        return {
          ...base,
          custom_sections: customSections.map((item) => {
            if (item.id !== customSectionId) return item;
            if (index < 0) {
              return {
                ...item,
                summary: newText,
              };
            }
            if (!item.lines[index]) return item;
            return {
              ...item,
              lines: item.lines.map((line, lineIndex) => (
                lineIndex === index ? newText : line
              )),
            };
          }),
        };
      }

      return base;
    });
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [currentResume, hiringManagerResult, postReviewPolish.status, resetPostReviewPolish]);

  const handleDirectBulletRemove = useCallback((section: string, index: number) => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;

      if (section === 'core_competencies') {
        if (!base.core_competencies[index]) return base;
        return {
          ...base,
          core_competencies: base.core_competencies.filter((_, itemIndex) => itemIndex !== index),
        };
      }

      if (section === 'selected_accomplishments') {
        if (!base.selected_accomplishments[index]) return base;
        return {
          ...base,
          selected_accomplishments: base.selected_accomplishments.filter((_, itemIndex) => itemIndex !== index),
        };
      }

      if (section === 'professional_experience') {
        const experienceIndex = Math.floor(index / 100);
        const bulletIndex = index % 100;
        const experience = base.professional_experience[experienceIndex];
        if (!experience?.bullets?.[bulletIndex]) return base;

        return {
          ...base,
          professional_experience: base.professional_experience.map((entry, entryIndex) => (
            entryIndex === experienceIndex
              ? {
                  ...entry,
                  bullets: entry.bullets.filter((_, currentBulletIndex) => currentBulletIndex !== bulletIndex),
                }
              : entry
          )),
        };
      }

      const customSectionId = parseCustomSectionKey(section);
      if (customSectionId) {
        if (index < 0) return base;
        const customSections = Array.isArray(base.custom_sections) ? base.custom_sections : [];
        const customSection = customSections.find((item) => item.id === customSectionId);
        if (!customSection?.lines[index]) return base;

        const nextLines = customSection.lines.filter((_, lineIndex) => lineIndex !== index);
        if (nextLines.length === 0 && !customSection.summary?.trim()) {
          return removeResumeCustomSection(base, customSectionId);
        }

        return {
          ...base,
          custom_sections: customSections.map((item) => (
            item.id === customSectionId
              ? {
                  ...item,
                  lines: nextLines,
                }
              : item
          )),
        };
      }

      return base;
    });
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [currentResume, hiringManagerResult, postReviewPolish.status, resetPostReviewPolish]);

  const markResumeArtifactsStale = useCallback(() => {
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [hiringManagerResult, postReviewPolish.status, resetPostReviewPolish]);

  const handleMoveSection = useCallback((sectionId: string, direction: 'up' | 'down') => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;
      return moveResumeSection(base, sectionId, direction);
    });
    markResumeArtifactsStale();
  }, [currentResume, markResumeArtifactsStale]);

  const handleToggleSection = useCallback((sectionId: string, enabled: boolean) => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;
      return setResumeSectionEnabled(base, sectionId, enabled);
    });
    markResumeArtifactsStale();
  }, [currentResume, markResumeArtifactsStale]);

  const handleAddAISection = useCallback(() => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;
      return addOrEnableAIHighlightsSection(base, data.candidateIntelligence, data.requirementWorkItems);
    });
    markResumeArtifactsStale();
  }, [currentResume, data.candidateIntelligence, data.requirementWorkItems, markResumeArtifactsStale]);

  const handleRemoveCustomSection = useCallback((sectionId: string) => {
    setEditableResume((prev) => {
      const base = normalizeResumeDraft(prev ?? currentResume);
      if (!base) return prev;
      return removeResumeCustomSection(base, sectionId);
    });
    markResumeArtifactsStale();
  }, [currentResume, markResumeArtifactsStale]);

  // Trigger the post-review polish pass only after an accepted Final Review fix.
  useEffect(() => {
    if (!editableResume || !isComplete || !pendingPostReviewPolishRef.current) return;

    const trigger = pendingPostReviewPolishRef.current;
    pendingPostReviewPolishRef.current = null;
    void runPolish(editableResume, jobDescription, { concernId: trigger.concernId });
  }, [editableResume, isComplete, jobDescription, runPolish]);

  useEffect(() => {
    if (masterSaveMode === 'master_resume') {
      setMasterSaveStatus({
        tone: 'neutral',
        message: selectedPromotableItems.length > 0
          ? `Auto-sync is on. ${selectedPromotableItems.length} selected edit${selectedPromotableItems.length === 1 ? '' : 's'} can be promoted to your master resume.`
          : currentClarificationMemory.length > 0
            ? `Auto-sync is on. ${currentClarificationMemory.length} clarification insight${currentClarificationMemory.length === 1 ? '' : 's'} will be saved to your master resume evidence library.`
            : 'Auto-sync is on, but no accepted draft edits are selected for master resume promotion yet.',
      });
      return;
    }

    setMasterSaveStatus((prev) => (
      prev.tone === 'error'
        ? prev
        : {
            tone: 'neutral',
            message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
          }
    ));
  }, [currentClarificationMemory.length, masterSaveMode, selectedPromotableItems.length]);

  const persistResumeToMaster = useCallback(async (
    draft: ResumeDraft,
    reason: 'auto' | 'manual',
  ) => {
    if (!onSyncToMasterResume || isSavingToMaster) return false;

    if (promotableMasterItems.length > 0 && selectedPromotableItems.length === 0 && currentClarificationMemory.length === 0) {
      setMasterSaveStatus({
        tone: 'neutral',
        message: 'Select at least one accepted draft edit before promoting content to the master resume.',
      });
      if (reason === 'manual') {
        addToast({
          type: 'error',
          message: 'No accepted edits are selected for master resume promotion.',
        });
      }
      return false;
    }

    setIsSavingToMaster(true);

    const result = await onSyncToMasterResume(draft, {
      sourceSessionId: data.sessionId || null,
      companyName: data.jobIntelligence?.company_name,
      jobTitle: data.jobIntelligence?.role_title,
      atsScore: liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? undefined,
      promotionItems: selectedPromotableItems,
      clarificationMemory: currentClarificationMemory,
    });

    setIsSavingToMaster(false);

    if (!result.success) {
      setMasterSaveStatus({
        tone: 'error',
        message: result.message,
      });

      if (reason === 'auto') {
        setMasterSaveMode('session_only');
        addToast({
          type: 'error',
          message: `${result.message} Auto-sync to master resume was turned off.`,
        });
      } else {
        addToast({ type: 'error', message: result.message });
      }
      return false;
    }

    lastMasterSnapshotRef.current = JSON.stringify({
      resume: resumeToPlainText(draft),
      promotion_ids: selectedPromotableItems.map((item) => item.id),
      clarification_ids: currentClarificationMemory.map((item) => item.id),
    });
    setMasterSaveStatus({
      tone: 'success',
      message: reason === 'auto' ? 'Auto-synced to your master resume.' : result.message,
    });

    if (reason === 'manual') {
      addToast({ type: 'success', message: result.message });
    }
    return true;
  }, [
    addToast,
    data.assembly?.scores.ats_match,
    data.jobIntelligence?.company_name,
    data.jobIntelligence?.role_title,
    data.sessionId,
    isSavingToMaster,
    liveScores?.ats_score,
    onSyncToMasterResume,
    promotableMasterItems.length,
    selectedPromotableItems,
    currentClarificationMemory,
  ]);

  useEffect(() => {
    if (masterSaveMode !== 'master_resume' || !editableResume || isSavingToMaster) return;
    if (promotableMasterItems.length > 0 && selectedPromotableItems.length === 0 && currentClarificationMemory.length === 0) return;

    const snapshot = JSON.stringify({
      resume: resumeToPlainText(editableResume),
      promotion_ids: selectedPromotableItems.map((item) => item.id),
      clarification_ids: currentClarificationMemory.map((item) => item.id),
    });
    if (snapshot === lastMasterSnapshotRef.current) return;

    const timer = window.setTimeout(() => {
      void persistResumeToMaster(editableResume, 'auto');
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    editableResume,
    isSavingToMaster,
    masterSaveMode,
    persistResumeToMaster,
    currentClarificationMemory,
    promotableMasterItems.length,
    selectedPromotableItems,
  ]);

  useEffect(() => {
    if (!hiringManagerResult || !currentResume || !finalReviewResumeText) return;

    const currentResumeText = resumeToPlainText(currentResume);
    const shouldBeStale = currentResumeText !== finalReviewResumeText;
    if (shouldBeStale !== isFinalReviewStale) {
      setIsFinalReviewStale(shouldBeStale);
    }
    if (shouldBeStale && finalReviewWarningsAcknowledged) {
      setFinalReviewWarningsAcknowledged(false);
    }
  }, [
    currentResume,
    finalReviewResumeText,
    finalReviewWarningsAcknowledged,
    hiringManagerResult,
    isFinalReviewStale,
  ]);

  useEffect(() => {
    const nextIds = promotableMasterItems.map((item) => item.id);
    if (nextIds.length === 0) {
      if (selectedMasterPromotionIds.length > 0) {
        setSelectedMasterPromotionIds([]);
      }
      return;
    }

    setSelectedMasterPromotionIds((previous) => {
      const preserved = previous.filter((id) => nextIds.includes(id));
      const newIds = nextIds.filter((id) => !previous.includes(id));
      const merged = [...preserved, ...newIds];
      if (merged.length === previous.length && merged.every((id, index) => id === previous[index])) {
        return previous;
      }
      return merged;
    });
  }, [promotableMasterItems, selectedMasterPromotionIds.length]);

  useEffect(() => {
    if (!currentResume || !isComplete) return;

    const plainText = resumeToPlainText(currentResume);
    for (const [requirement, item] of Object.entries(gapChatSnapshot.items)) {
      if (item.resolvedLanguage && !plainText.includes(item.resolvedLanguage)) {
        clearGapResolvedLanguage(requirement);
      }
    }

    const missingResolvedIds = resolvedFinalReviewConcernIds.filter((concernId) => {
      const resolvedLanguage = finalReviewChatSnapshot.items[concernId.trim().toLowerCase()]?.resolvedLanguage;
      return resolvedLanguage ? !plainText.includes(resolvedLanguage) : true;
    });

    if (missingResolvedIds.length === 0) return;

    for (const concernId of missingResolvedIds) {
      clearFinalReviewResolvedLanguage(concernId);
    }
    setResolvedFinalReviewConcernIds((previous) => previous.filter((id) => !missingResolvedIds.includes(id)));
    setFinalReviewWarningsAcknowledged(false);
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [
    clearFinalReviewResolvedLanguage,
    clearGapResolvedLanguage,
    currentResume,
    finalReviewChatSnapshot,
    gapChatSnapshot,
    isComplete,
    postReviewPolish.status,
    resetPostReviewPolish,
    resolvedFinalReviewConcernIds,
  ]);

  useEffect(() => {
    if (!isComplete || !currentResume || hiringManagerResult) return undefined;

    const timeoutId = window.setTimeout(() => {
      trackProductEvent('resume_rewrite_stalled', {
        session_id: data.sessionId,
        has_resume: true,
        has_final_review: false,
      });
    }, 120000);

    return () => window.clearTimeout(timeoutId);
  }, [currentResume, data.sessionId, hiringManagerResult, isComplete]);

  useEffect(() => {
    if (!hiringManagerResult || (!isFinalReviewStale && unresolvedCriticalConcernCount === 0)) return undefined;

    const timeoutId = window.setTimeout(() => {
      trackProductEvent('final_review_stalled', {
        session_id: data.sessionId,
        is_stale: isFinalReviewStale,
        unresolved_critical_count: unresolvedCriticalConcernCount,
      });
    }, 120000);

    return () => window.clearTimeout(timeoutId);
  }, [data.sessionId, hiringManagerResult, isFinalReviewStale, unresolvedCriticalConcernCount]);

  useEffect(() => {
    if (!hiringManagerResult) return;

    const signature = JSON.stringify({
      verdict: hiringManagerResult.hiring_manager_verdict.rating,
      unresolvedCriticalConcernCount,
    });
    if (lastCompletedFinalReviewSignatureRef.current === signature) return;

    trackProductEvent('final_review_completed', {
      session_id: data.sessionId,
      verdict: hiringManagerResult.hiring_manager_verdict.rating,
      unresolved_critical_count: unresolvedCriticalConcernCount,
    });
    lastCompletedFinalReviewSignatureRef.current = signature;
  }, [data.sessionId, hiringManagerResult, unresolvedCriticalConcernCount]);

  useEffect(() => {
    if (!data.sessionId || !isComplete) return;

    const hasGapChatState = Object.keys(gapChatSnapshot.items).length > 0;
    const hasFinalReviewChatState = Object.keys(finalReviewChatSnapshot.items).length > 0;
    const hasFinalReviewState = Boolean(hiringManagerResult);
    const hasPostReviewPolish = postReviewPolish.status !== 'idle' || postReviewPolish.result !== null;

    const nextDraftState: V2PersistedDraftState | null = editableResume
      || masterSaveMode !== 'session_only'
      || hasGapChatState
      || hasFinalReviewState
      || hasFinalReviewChatState
      || hasPostReviewPolish
      || currentClarificationMemory.length > 0
      || promotableMasterItems.length > 0
      ? {
          editable_resume: normalizeResumeDraft(editableResume),
          master_save_mode: masterSaveMode,
          clarification_memory: currentClarificationMemory.length > 0 ? currentClarificationMemory : null,
          gap_chat_state: hasGapChatState ? gapChatSnapshot : null,
          final_review_state: hasFinalReviewState
            ? {
                result: hiringManagerResult,
                resolved_concern_ids: resolvedFinalReviewConcernIds,
                acknowledged_export_warnings: finalReviewWarningsAcknowledged,
                is_stale: isFinalReviewStale,
                reviewed_resume_text: finalReviewResumeText,
                last_run_at: new Date().toISOString(),
              }
            : null,
          final_review_chat_state: hasFinalReviewChatState ? finalReviewChatSnapshot : null,
          post_review_polish: hasPostReviewPolish ? postReviewPolish : null,
          master_promotion_state: promotableMasterItems.length > 0
            ? { selected_item_ids: selectedMasterPromotionIds }
            : null,
          updated_at: new Date().toISOString(),
        }
      : null;

    const serialized = JSON.stringify(nextDraftState);
    if (serialized === lastPersistedDraftRef.current) return;

    const timer = window.setTimeout(() => {
      writeLocalDraftState(data.sessionId, storageUserId, nextDraftState);
      void (async () => {
        const ok = await saveDraftState(data.sessionId, nextDraftState);
        if (ok) {
          lastPersistedDraftRef.current = serialized;
        }
      })();
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    data.sessionId,
    editableResume,
    finalReviewWarningsAcknowledged,
    finalReviewResumeText,
    finalReviewChatSnapshot,
    gapChatSnapshot,
    hiringManagerResult,
    isFinalReviewStale,
    isComplete,
    masterSaveMode,
    promotableMasterItems.length,
    postReviewPolish,
    resolvedFinalReviewConcernIds,
    saveDraftState,
    selectedMasterPromotionIds,
    storageUserId,
    currentClarificationMemory,
  ]);

  const isPipelineActive = data.sessionId !== '';

  const handleSubmit = useCallback((rt: string, jd: string) => {
    setResumeText(rt);
    setJobDescription(jd);
    // Capture the job URL if the JD field contains a URL (from the URL input in the intake form)
    try {
      const parsed = new URL(jd);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        setActiveJobUrl(jd);
      } else {
        setActiveJobUrl(null);
      }
    } catch {
      setActiveJobUrl(null);
    }
    setEditableResume(null);
    setClarificationMemory([]);
    setSessionLoadError(null);
    lastMasterSnapshotRef.current = '';
    lastPersistedDraftRef.current = 'null';
    setMasterSaveMode('session_only');
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
    });
    resetHistory();
    resetGapChat();
    resetFinalReviewChat();
    resetHiringManagerReview();
    setResolvedFinalReviewConcernIds([]);
    setFinalReviewWarningsAcknowledged(false);
    setIsFinalReviewStale(false);
    setFinalReviewResumeText(null);
    setSelectedMasterPromotionIds([]);
    resetPostReviewPolish();
    void start(rt, jd);
  }, [start, resetHistory, resetGapChat, resetFinalReviewChat, resetHiringManagerReview, resetPostReviewPolish]);

  // Gap coaching: user reviewed strategies → re-run pipeline with their decisions
  const handleGapCoachingRespond = useCallback((responses: GapCoachingResponse[]) => {
    // Build user_context from responses: approved strategies stay, skipped get excluded,
    // context responses get their user text appended
    const contextParts: string[] = [];
    const nextClarificationMemory = currentClarificationMemory;
    const skipped = responses.filter(r => r.action === 'skip').map(r => r.requirement);
    const withContext = responses.filter(r => r.action === 'context' && r.user_context);

    if (skipped.length > 0) {
      contextParts.push(`Do NOT use positioning strategies for these requirements (user marked as real gaps): ${skipped.join('; ')}`);
    }
    for (const r of withContext) {
      contextParts.push(`Additional context for "${r.requirement}": ${r.user_context}`);
    }

    setClarificationMemory(nextClarificationMemory);
    setEditableResume(null);
    resetHistory();
    resetGapChat();
    resetFinalReviewChat();
    resetHiringManagerReview();
    setResolvedFinalReviewConcernIds([]);
    setFinalReviewWarningsAcknowledged(false);
    setIsFinalReviewStale(false);
    setFinalReviewResumeText(null);
    setSelectedMasterPromotionIds([]);
    resetPostReviewPolish();
    void start(resumeText, jobDescription, {
      userContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      clarificationMemory: nextClarificationMemory,
      gapCoachingResponses: responses,
      preScores: data.preScores,
    });
  }, [
    currentClarificationMemory,
    start,
    resumeText,
    jobDescription,
    resetHistory,
    resetGapChat,
    resetFinalReviewChat,
    resetHiringManagerReview,
    resetPostReviewPolish,
    data.preScores,
  ]);

  // Keyword integration: use inline edit with 'add_keywords' action
  // Use positioning assessment to find the most relevant entry when available
  const handleIntegrateKeyword = useCallback((keyword: string) => {
    if (!currentResume) return;
    // Try to find a relevant experience entry using positioning assessment
    let targetBullet = '';
    let section = '';

    if (data.assembly?.positioning_assessment?.requirement_map) {
      // Find a requirement that mentions this keyword
      const reqEntry = data.assembly.positioning_assessment.requirement_map.find(
        r => r.requirement.toLowerCase().includes(keyword.toLowerCase()),
      );
      if (reqEntry?.addressed_by?.length) {
        targetBullet = reqEntry.addressed_by[0].bullet_text;
        section = reqEntry.addressed_by[0].section;
      }
    }

    // Fallback to first experience bullet
    if (!targetBullet) {
      const firstExp = currentResume.professional_experience[0];
      if (!firstExp || firstExp.bullets.length === 0) return;
      targetBullet = firstExp.bullets[0].text;
      section = `Professional Experience - ${firstExp.company}`;
    }

    requestEdit(targetBullet, section, 'add_keywords', `Naturally integrate this specific keyword/phrase into the text: "${keyword}"`);
  }, [currentResume, data.assembly, requestEdit]);

  const handleAddContext = useCallback((userContext: string) => {
    // Snapshot the current resume before the re-run so we can show what changed
    const nextClarificationMemory = currentClarificationMemory;
    setClarificationMemory(nextClarificationMemory);
    setPreviousResume(editableResume ?? data.assembly?.final_resume ?? data.resumeDraft ?? null);
    setEditableResume(null);
    resetHistory();
    resetGapChat();
    resetFinalReviewChat();
    resetHiringManagerReview();
    setResolvedFinalReviewConcernIds([]);
    setFinalReviewWarningsAcknowledged(false);
    setIsFinalReviewStale(false);
    setFinalReviewResumeText(null);
    setSelectedMasterPromotionIds([]);
    resetPostReviewPolish();
    void start(resumeText, jobDescription, {
      userContext,
      clarificationMemory: nextClarificationMemory,
      preScores: data.preScores,
    });
  }, [
    currentClarificationMemory,
    start,
    resumeText,
    jobDescription,
    resetHistory,
    resetGapChat,
    resetFinalReviewChat,
    resetHiringManagerReview,
    resetPostReviewPolish,
    editableResume,
    data.assembly,
    data.resumeDraft,
    data.preScores,
  ]);

  const handleDismissChanges = useCallback(() => {
    setPreviousResume(null);
  }, []);

  const handleStartOver = useCallback(() => {
    setAttemptedHistoricalSessionKey(null);
    setActiveHistoricalSessionKey(null);
    reset();
    resetScreenState({ clearInputs: true });
  }, [reset, resetScreenState]);

  const handleSaveCurrentToMaster = useCallback(() => {
    if (!currentResume) return;
    void persistResumeToMaster(currentResume, 'manual');
  }, [currentResume, persistResumeToMaster]);

  const handleToggleMasterPromotionItem = useCallback((itemId: string) => {
    setSelectedMasterPromotionIds((previous) => (
      previous.includes(itemId)
        ? previous.filter((id) => id !== itemId)
        : [...previous, itemId]
    ));
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'Promotion selection updated. Only checked edits will be added to your master resume.',
    });
  }, []);

  const handleSelectAllMasterPromotionItems = useCallback(() => {
    setSelectedMasterPromotionIds(promotableMasterItems.map((item) => item.id));
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'All promotable edits are selected for master resume sync.',
    });
  }, [promotableMasterItems]);

  const handleClearMasterPromotionItems = useCallback(() => {
    setSelectedMasterPromotionIds([]);
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'Master resume sync is now limited to zero selected edits until you check items again.',
    });
  }, []);

  const handleUndo = useCallback(() => {
    undo();
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [undo, hiringManagerResult, postReviewPolish.status, resetPostReviewPolish]);

  const handleRedo = useCallback(() => {
    redo();
    if (hiringManagerResult) {
      setIsFinalReviewStale(true);
      setFinalReviewWarningsAcknowledged(false);
    }
    if (postReviewPolish.status !== 'idle') {
      resetPostReviewPolish();
    }
  }, [redo, hiringManagerResult, postReviewPolish.status, resetPostReviewPolish]);

  // Final review: recruiter scan + hiring manager critique + benchmark comparison
  const handleRequestHiringManagerReview = useCallback(() => {
    const jobIntelligence = data.jobIntelligence;
    if (!currentResume || !jobIntelligence) return;
    const serializedResume = resumeToPlainText(currentResume);
    const benchmarkRequirements = data.benchmarkCandidate
      ? [
          ...data.benchmarkCandidate.expected_achievements.map(
            achievement => `${achievement.area}: ${achievement.description}${achievement.typical_metrics ? ` (Typical metrics: ${achievement.typical_metrics})` : ''}`,
          ),
          `Leadership scope: ${data.benchmarkCandidate.expected_leadership_scope}`,
          ...data.benchmarkCandidate.expected_industry_knowledge,
          ...data.benchmarkCandidate.expected_technical_skills,
          ...data.benchmarkCandidate.expected_certifications,
          ...data.benchmarkCandidate.differentiators,
        ]
      : undefined;

    trackProductEvent('final_review_requested', {
      session_id: data.sessionId,
      company_name: jobIntelligence.company_name,
      role_title: jobIntelligence.role_title,
    });

    void (async () => {
      await rawRequestReview({
        resume_text: serializedResume,
        job_description: jobDescription,
        company_name: jobIntelligence.company_name,
        role_title: jobIntelligence.role_title,
        job_requirements: [
          ...jobIntelligence.core_competencies.map(c => c.competency),
          ...jobIntelligence.strategic_responsibilities,
        ],
        hidden_signals: jobIntelligence.hidden_hiring_signals,
        benchmark_profile_summary: data.benchmarkCandidate?.ideal_profile_summary,
        benchmark_requirements: benchmarkRequirements,
      });
      setFinalReviewResumeText(serializedResume);
      setIsFinalReviewStale(false);
      setResolvedFinalReviewConcernIds([]);
      setFinalReviewWarningsAcknowledged(false);
      resetFinalReviewChat();
      resetPostReviewPolish();
    })();
  }, [
    currentResume,
    data.benchmarkCandidate,
    data.jobIntelligence,
    data.sessionId,
    jobDescription,
    rawRequestReview,
    resetFinalReviewChat,
    resetPostReviewPolish,
  ]);

  const resolveFinalReviewTarget = useCallback((concern: HiringManagerConcern) => {
    if (!currentResume) return null;
    return findResumeTargetForFinalReviewConcern(
      currentResume,
      concern,
      data.assembly?.positioning_assessment,
    );
  }, [currentResume, data.assembly?.positioning_assessment]);

  const previewFinalReviewTarget = useCallback((concern: HiringManagerConcern) => {
    const matchedTarget = resolveFinalReviewTarget(concern);
    if (!matchedTarget?.selector) return;
    scrollToAndFocusTarget(matchedTarget.selector);
  }, [resolveFinalReviewTarget]);

  // Apply a final review concern as an inline edit
  const handleApplyHiringManagerRecommendation = useCallback((
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed = false,
  ) => {
    if (!currentResume) return;
    const matchedTarget = resolveFinalReviewTarget(concern);
    if (matchedTarget?.selector) {
      scrollToAndFocusTarget(matchedTarget.selector);
    }
    const section = matchedTarget?.section ?? concern.target_section ?? 'Executive Summary';
    const targetText = matchedTarget?.text ?? extractResumeExcerptForSection(currentResume, concern.target_section);
    if (!targetText.trim()) return;
    const suggestedLanguage = languageOverride ?? concern.suggested_resume_edit;
    const instruction = suggestedLanguage
      ? `${concern.fix_strategy}\n\nUse this sample direction if it remains strictly truthful:\n${suggestedLanguage}`
      : concern.fix_strategy;
    requestEdit(targetText, section, 'custom', instruction, {
      requirement: concern.related_requirement,
      strategy: concern.fix_strategy,
      origin: 'final_review',
      scoreDomain: concern.related_requirement ? 'both' : 'job_description',
      candidateInputUsed,
      finalReviewConcernId: concern.id,
      finalReviewConcernSeverity: concern.severity,
    });
  }, [currentResume, requestEdit, resolveFinalReviewTarget]);

  if (!isPipelineActive) {
    return (
      <V2IntakeForm
        onSubmit={handleSubmit}
        onBack={onBack}
        loading={isStarting}
        error={sessionLoadError ?? error}
        initialResumeText={initialResumeText}
        initialJobUrl={initialJobUrl}
        onLoadMasterResume={onLoadMasterResume}
      />
    );
  }

  // Display score — live score overrides pipeline score
  const displayAtsScore = postReviewPolish.result?.ats_score ?? liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? null;
  const displayTruthScore = data.assembly?.scores.truth ?? null;
  const displayToneScore = postReviewPolish.result?.tone_score ?? data.assembly?.scores.tone ?? null;
  const gapChatSnapshotForDisplay = isComplete ? gapChatSnapshot : null;
  const finalReviewChatSnapshotForDisplay = isComplete ? finalReviewChatSnapshot : null;

  const stepLabel = !isComplete
    ? 'Building your resume...'
    : hiringManagerResult && !isFinalReviewStale
      ? 'Step 7 — Ready to export'
      : 'Step 6 — Review and refine';

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--line-soft)]">
        <GlassButton
          variant="ghost"
          size="sm"
          onClick={isComplete ? handleStartOver : onBack}
          className="gap-1.5 text-xs"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isComplete ? 'New Resume' : 'Back'}
        </GlassButton>

        {data.jobIntelligence && (
          <span className="text-xs text-[var(--text-soft)] truncate">
            {data.jobIntelligence.role_title} at {data.jobIntelligence.company_name}
          </span>
        )}

        <span className="text-xs text-[var(--text-soft)] shrink-0">{stepLabel}</span>

        {/* Live scores + DOCX download in header */}
        {isComplete && (displayAtsScore !== null || currentResume) && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            {displayAtsScore !== null && (
              <>
                <div className="flex items-center gap-1">
                  {isScoring && <Loader2 className="h-3 w-3 text-[var(--text-soft)] motion-safe:animate-spin" />}
                  <span className="text-[var(--badge-blue-text)]">Resume Match: {displayAtsScore}%</span>
                </div>
                {displayTruthScore !== null && (
                  <span className="text-[var(--badge-green-text)]">Accuracy: {displayTruthScore}%</span>
                )}
                {displayToneScore !== null && (
                  <span className="text-[var(--badge-amber-text)]">Tone: {displayToneScore}%</span>
                )}
              </>
            )}
            {currentResume && (
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleTopBarDocx}
                disabled={isExportingDocx}
                aria-busy={isExportingDocx}
                aria-label="Download resume as DOCX"
                className="gap-1 text-xs"
              >
                {isExportingDocx
                  ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
                  : <FileDown className="h-3.5 w-3.5" />}
                DOCX
              </GlassButton>
            )}
          </div>
        )}
      </div>

      {/* Streaming display with inline editing */}
      <V2StreamingDisplay
        data={data}
        isComplete={isComplete}
        isConnected={isConnected}
        error={error}
        editableResume={editableResume}
        pendingEdit={pendingEdit}
        isEditing={isEditing}
        editError={editError}
        undoCount={undoCount}
        redoCount={redoCount}
        onRequestEdit={requestEdit}
        onAcceptEdit={acceptEdit}
        onRejectEdit={rejectEdit}
        onBulletEdit={handleDirectBulletEdit}
        onBulletRemove={handleDirectBulletRemove}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddContext={handleAddContext}
        isRerunning={isStarting}
        liveScores={liveScores}
        isScoring={isScoring}
        gapCoachingCards={data.gapCoachingCards}
        onRespondGapCoaching={handleGapCoachingRespond}
        preScores={data.preScores}
        onIntegrateKeyword={handleIntegrateKeyword}
        previousResume={previousResume}
        onDismissChanges={handleDismissChanges}
        hiringManagerResult={hiringManagerResult}
        resolvedFinalReviewConcernIds={resolvedFinalReviewConcernIds}
        isFinalReviewStale={isFinalReviewStale}
        finalReviewWarningsAcknowledged={finalReviewWarningsAcknowledged}
        onAcknowledgeFinalReviewWarnings={() => setFinalReviewWarningsAcknowledged(true)}
        isHiringManagerLoading={isHiringManagerLoading}
        hiringManagerError={hiringManagerError}
        onRequestHiringManagerReview={handleRequestHiringManagerReview}
        onApplyHiringManagerRecommendation={handleApplyHiringManagerRecommendation}
        gapChat={isComplete ? gapChat : null}
        gapChatSnapshot={gapChatSnapshotForDisplay}
        buildChatContext={isComplete ? buildChatContext : undefined}
        finalReviewChat={isComplete ? finalReviewChat : null}
        finalReviewChatSnapshot={finalReviewChatSnapshotForDisplay}
        buildFinalReviewChatContext={isComplete ? buildFinalReviewChatContext : undefined}
        resolveFinalReviewTarget={isComplete ? resolveFinalReviewTarget : undefined}
        onPreviewFinalReviewTarget={isComplete ? previewFinalReviewTarget : undefined}
        postReviewPolish={postReviewPolish}
        masterSaveMode={masterSaveMode}
        onChangeMasterSaveMode={setMasterSaveMode}
        onSaveCurrentToMaster={handleSaveCurrentToMaster}
        isSavingToMaster={isSavingToMaster}
        masterSaveStatus={masterSaveStatus}
        promotableMasterItems={promotableMasterItems}
        selectedMasterPromotionIds={selectedMasterPromotionIds}
        onToggleMasterPromotionItem={handleToggleMasterPromotionItem}
        onSelectAllMasterPromotionItems={handleSelectAllMasterPromotionItems}
        onClearMasterPromotionItems={handleClearMasterPromotionItems}
        onGapAssist={handleGapAssist}
        onBulletEnhance={handleBulletEnhance}
        onMoveSection={handleMoveSection}
        onToggleSection={handleToggleSection}
        onAddAISection={handleAddAISection}
        onRemoveCustomSection={handleRemoveCustomSection}
        jobUrl={activeJobUrl ?? undefined}
        accessToken={accessToken}
        clarificationMemory={currentClarificationMemory}
      />
    </div>
  );
}
