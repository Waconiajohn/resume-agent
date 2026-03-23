/**
 * V2ResumeScreen — Main screen for the v2 resume pipeline
 *
 * Two states:
 *   1. Intake — two-field form (resume + JD)
 *   2. Streaming — accumulating output display with inline AI editing + live scoring
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useV2Pipeline } from '@/hooks/useV2Pipeline';
import { useInlineEdit, resumeToPlainText } from '@/hooks/useInlineEdit';
import { useLiveScoring } from '@/hooks/useLiveScoring';
import { useGapChat } from '@/hooks/useGapChat';
import { useFinalReviewChat } from '@/hooks/useFinalReviewChat';
import { usePostReviewPolish } from '@/hooks/usePostReviewPolish';
import { GlassButton } from '../GlassButton';
import { V2IntakeForm } from './V2IntakeForm';
import { V2StreamingDisplay } from './V2StreamingDisplay';
import type {
  FinalReviewChatContext,
  ResumeDraft,
  GapCoachingResponse,
  GapChatContext,
  MasterPromotionItem,
  V2PersistedDraftState,
} from '@/types/resume-v2';
import { normalizeRequirement } from './utils/coaching-actions';
import { useHiringManagerReview } from '@/hooks/useHiringManagerReview';
import type { HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import { useToast } from '@/components/Toast';
import { getPromotableResumeItems } from '@/lib/master-resume-promotion';
import { trackProductEvent } from '@/lib/product-telemetry';

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
    },
  ) => Promise<MasterResumeSaveResult>;
}

function v2DraftStorageKey(sessionId: string): string {
  return `resume-agent:v2-draft:${sessionId}`;
}

function readLocalDraftState(sessionId: string): V2PersistedDraftState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(v2DraftStorageKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as V2PersistedDraftState;
  } catch {
    return null;
  }
}

function writeLocalDraftState(sessionId: string, draftState: V2PersistedDraftState | null) {
  if (typeof window === 'undefined') return;
  try {
    if (draftState === null) {
      window.localStorage.removeItem(v2DraftStorageKey(sessionId));
      return;
    }
    window.localStorage.setItem(v2DraftStorageKey(sessionId), JSON.stringify(draftState));
  } catch {
    // Best effort only
  }
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

export function V2ResumeScreen({ accessToken, onBack, initialResumeText, initialSessionId, onSyncToMasterResume }: V2ResumeScreenProps) {
  const { data, isConnected, isComplete, isStarting, error, start, reset, loadSession, saveDraftState, integrateKeyword } = useV2Pipeline(accessToken);
  const { addToast } = useToast();

  // Track the editable resume separately — starts as the pipeline output,
  // then gets mutated by inline edits
  const [editableResume, setEditableResume] = useState<ResumeDraft | null>(null);

  // The resume to use: user-edited version takes precedence over pipeline output
  const currentResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft ?? null;

  // Store inputs for inline edit context and re-runs
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');

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
  const [resolvedFinalReviewConcernIds, setResolvedFinalReviewConcernIds] = useState<string[]>([]);
  const [finalReviewWarningsAcknowledged, setFinalReviewWarningsAcknowledged] = useState(false);
  const [isFinalReviewStale, setIsFinalReviewStale] = useState(false);
  const [finalReviewResumeText, setFinalReviewResumeText] = useState<string | null>(null);
  const [masterSaveMode, setMasterSaveMode] = useState<MasterResumeSaveMode>('session_only');
  const [isSavingToMaster, setIsSavingToMaster] = useState(false);
  const [masterSaveStatus, setMasterSaveStatus] = useState<{
    tone: 'neutral' | 'success' | 'error';
    message: string;
  }>({
    tone: 'neutral',
    message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
  });
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

  // Build context for per-item gap chat — memoized factory
  const buildChatContext = useCallback((requirement: string): GapChatContext => {
    const ji = data.jobIntelligence;
    const ci = data.candidateIntelligence;
    const ga = data.gapAnalysis;

    // Find the matching requirement in gap analysis (normalized + fallback)
    const normalized = normalizeRequirement(requirement);
    const gapReq = ga?.requirements.find(
      r => normalizeRequirement(r.requirement) === normalized,
    ) ?? ga?.requirements.find(
      r => r.requirement.toLowerCase().includes(normalized) || normalized.includes(r.requirement.toLowerCase()),
    );

    // Find JD evidence for this requirement (normalized + fallback)
    const comp = ji?.core_competencies.find(
      c => normalizeRequirement(c.competency) === normalized,
    ) ?? ji?.core_competencies.find(
      c => c.competency.toLowerCase().includes(normalized) || normalized.includes(c.competency.toLowerCase()),
    );

    return {
      evidence: gapReq?.evidence ?? [],
      currentStrategy: gapReq?.strategy?.positioning,
      aiReasoning: gapReq?.strategy?.ai_reasoning,
      inferredMetric: gapReq?.strategy?.inferred_metric,
      jobDescriptionExcerpt: comp?.evidence_from_jd
        ?? ji?.core_competencies.map(c => `${c.competency} (${c.importance})`).join(', ')
        ?? '',
      candidateExperienceSummary: ci
        ? `${ci.career_themes.join(', ')}. ${ci.leadership_scope}. Scale: ${ci.operational_scale}.`
        : '',
    };
  }, [data.jobIntelligence, data.candidateIntelligence, data.gapAnalysis]);

  const buildFinalReviewChatContext = useCallback((concern: HiringManagerConcern): FinalReviewChatContext | null => {
    if (!currentResume || !data.jobIntelligence || !hiringManagerResult) return null;

    return {
      concernId: concern.id,
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
  }, [currentResume, data.jobIntelligence, hiringManagerResult]);

  // Seed initial scores from pipeline assembly
  useEffect(() => {
    if (data.assembly) {
      setInitialScores(data.assembly.scores.ats_match);
    }
  }, [data.assembly, setInitialScores]);

  // Load a historical V2 session on mount
  const [sessionLoadAttempted, setSessionLoadAttempted] = useState(false);
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (!initialSessionId || sessionLoadAttempted) return;
    setSessionLoadAttempted(true);
    void (async () => {
      const result = await loadSession(initialSessionId);
      if (result) {
        const resolvedDraftState = result.draftState ?? readLocalDraftState(initialSessionId);
        setResumeText(result.resume_text);
        setJobDescription(result.job_description);
        setEditableResume(resolvedDraftState?.editable_resume ?? null);
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
      } else {
        setSessionLoadError('Failed to load session. It may have expired or belong to a different account.');
      }
    })();
  }, [
    initialSessionId,
    sessionLoadAttempted,
    loadSession,
    hydrateFinalReviewChatSnapshot,
    hydrateGapChatSnapshot,
    hydrateHiringManagerReview,
    hydratePostReviewPolish,
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
          : 'Auto-sync is on, but no accepted AI-created edits are selected for master resume promotion yet.',
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
  }, [masterSaveMode, selectedPromotableItems.length]);

  const persistResumeToMaster = useCallback(async (
    draft: ResumeDraft,
    reason: 'auto' | 'manual',
  ) => {
    if (!onSyncToMasterResume || isSavingToMaster) return false;

    if (promotableMasterItems.length > 0 && selectedPromotableItems.length === 0) {
      setMasterSaveStatus({
        tone: 'neutral',
        message: 'Select at least one accepted AI-created edit before promoting content to the master resume.',
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
  ]);

  useEffect(() => {
    if (masterSaveMode !== 'master_resume' || !editableResume || isSavingToMaster) return;
    if (promotableMasterItems.length > 0 && selectedPromotableItems.length === 0) return;

    const snapshot = JSON.stringify({
      resume: resumeToPlainText(editableResume),
      promotion_ids: selectedPromotableItems.map((item) => item.id),
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
    const gapSnapshot = getGapChatSnapshot();
    for (const [requirement, item] of Object.entries(gapSnapshot.items)) {
      if (item.resolvedLanguage && !plainText.includes(item.resolvedLanguage)) {
        clearGapResolvedLanguage(requirement);
      }
    }

    const finalReviewSnapshot = getFinalReviewChatSnapshot();
    const missingResolvedIds = resolvedFinalReviewConcernIds.filter((concernId) => {
      const resolvedLanguage = finalReviewSnapshot.items[concernId.trim().toLowerCase()]?.resolvedLanguage;
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
    getFinalReviewChatSnapshot,
    getGapChatSnapshot,
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

    const gapChatSnapshot = getGapChatSnapshot();
    const finalReviewChatSnapshot = getFinalReviewChatSnapshot();
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
      || promotableMasterItems.length > 0
      ? {
          editable_resume: editableResume,
          master_save_mode: masterSaveMode,
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
      writeLocalDraftState(data.sessionId, nextDraftState);
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
    getFinalReviewChatSnapshot,
    getGapChatSnapshot,
    hiringManagerResult,
    isFinalReviewStale,
    isComplete,
    masterSaveMode,
    promotableMasterItems.length,
    postReviewPolish,
    resolvedFinalReviewConcernIds,
    saveDraftState,
    selectedMasterPromotionIds,
  ]);

  const isPipelineActive = data.sessionId !== '';

  const handleSubmit = useCallback((rt: string, jd: string) => {
    setResumeText(rt);
    setJobDescription(jd);
    setEditableResume(null);
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
    const skipped = responses.filter(r => r.action === 'skip').map(r => r.requirement);
    const withContext = responses.filter(r => r.action === 'context' && r.user_context);

    if (skipped.length > 0) {
      contextParts.push(`Do NOT use positioning strategies for these requirements (user marked as real gaps): ${skipped.join('; ')}`);
    }
    for (const r of withContext) {
      contextParts.push(`Additional context for "${r.requirement}": ${r.user_context}`);
    }

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
      gapCoachingResponses: responses,
      preScores: data.preScores,
    });
  }, [
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

  // Track the resume from the previous run so the WhatChangedCard can diff it
  const [previousResume, setPreviousResume] = useState<ResumeDraft | null>(null);

  const handleAddContext = useCallback((userContext: string) => {
    // Snapshot the current resume before the re-run so we can show what changed
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
    void start(resumeText, jobDescription, { userContext, preScores: data.preScores });
  }, [
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
    reset();
    setEditableResume(null);
    setPreviousResume(null);
    lastMasterSnapshotRef.current = '';
    lastPersistedDraftRef.current = 'null';
    setMasterSaveMode('session_only');
    setMasterSaveStatus({
      tone: 'neutral',
      message: 'Accepted edits stay in this session unless you choose to sync them to your master resume.',
    });
    setResumeText('');
    setJobDescription('');
    setSessionLoadAttempted(false);
    setSessionLoadError(null);
    resetHiringManagerReview();
    resetGapChat();
    resetFinalReviewChat();
    setResolvedFinalReviewConcernIds([]);
    setFinalReviewWarningsAcknowledged(false);
    setIsFinalReviewStale(false);
    setFinalReviewResumeText(null);
    setSelectedMasterPromotionIds([]);
    resetPostReviewPolish();
  }, [reset, resetHiringManagerReview, resetGapChat, resetFinalReviewChat, resetPostReviewPolish]);

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

  // Apply a final review concern as an inline edit
  const handleApplyHiringManagerRecommendation = useCallback((
    concern: HiringManagerConcern,
    languageOverride?: string,
    candidateInputUsed = false,
  ) => {
    if (!currentResume) return;
    const section = concern.target_section ?? 'Executive Summary';
    const sectionLower = section.toLowerCase();
    let targetText = '';

    if (sectionLower.includes('executive summary') || sectionLower.includes('summary')) {
      targetText = currentResume.executive_summary?.content ?? '';
    } else if (sectionLower.includes('accomplishment')) {
      targetText = currentResume.selected_accomplishments[0]?.content ?? '';
    } else if (sectionLower.includes('competenc')) {
      targetText = currentResume.core_competencies.join(', ');
    } else {
      // Try matching by company name in professional experience
      for (const exp of currentResume.professional_experience) {
        if (sectionLower.includes(exp.company.toLowerCase())) {
          targetText = exp.bullets[0]?.text ?? '';
          break;
        }
      }
    }

    // Ultimate fallback: first experience bullet
    if (!targetText && currentResume.professional_experience.length > 0) {
      targetText = currentResume.professional_experience[0].bullets[0]?.text ?? '';
    }
    if (!targetText) return;
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
  }, [currentResume, requestEdit]);

  if (!isPipelineActive) {
    return (
      <V2IntakeForm
        onSubmit={handleSubmit}
        loading={isStarting}
        error={sessionLoadError ?? error}
        initialResumeText={initialResumeText}
      />
    );
  }

  // Display score — live score overrides pipeline score
  const displayAtsScore = postReviewPolish.result?.ats_score ?? liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? null;
  const displayTruthScore = data.assembly?.scores.truth ?? null;
  const displayToneScore = postReviewPolish.result?.tone_score ?? data.assembly?.scores.tone ?? null;
  const gapChatSnapshot = isComplete ? getGapChatSnapshot() : null;
  const finalReviewChatSnapshot = isComplete ? getFinalReviewChatSnapshot() : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06]">
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
          <span className="text-xs text-white/40 truncate">
            {data.jobIntelligence.role_title} at {data.jobIntelligence.company_name}
          </span>
        )}

        {/* Live scores in header */}
        {isComplete && displayAtsScore !== null && (
          <div className="ml-auto flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              {isScoring && <Loader2 className="h-3 w-3 text-white/30 motion-safe:animate-spin" />}
              <span className="text-[#afc4ff]">Match: {displayAtsScore}%</span>
            </div>
            {displayTruthScore !== null && (
              <span className="text-[#b5dec2]">Accuracy: {displayTruthScore}%</span>
            )}
            {displayToneScore !== null && (
              <span className="text-[#f0d99f]">Tone: {displayToneScore}%</span>
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
        gapChatSnapshot={gapChatSnapshot}
        buildChatContext={isComplete ? buildChatContext : undefined}
        finalReviewChat={isComplete ? finalReviewChat : null}
        finalReviewChatSnapshot={finalReviewChatSnapshot}
        buildFinalReviewChatContext={isComplete ? buildFinalReviewChatContext : undefined}
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
      />
    </div>
  );
}
