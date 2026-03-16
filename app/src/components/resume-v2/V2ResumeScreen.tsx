/**
 * V2ResumeScreen — Main screen for the v2 resume pipeline
 *
 * Two states:
 *   1. Intake — two-field form (resume + JD)
 *   2. Streaming — accumulating output display with inline AI editing + live scoring
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useV2Pipeline } from '@/hooks/useV2Pipeline';
import { useInlineEdit, resumeToPlainText } from '@/hooks/useInlineEdit';
import { useLiveScoring } from '@/hooks/useLiveScoring';
import { useGapChat } from '@/hooks/useGapChat';
import { GlassButton } from '../GlassButton';
import { V2IntakeForm } from './V2IntakeForm';
import { V2StreamingDisplay } from './V2StreamingDisplay';
import type { ResumeDraft, GapCoachingResponse, GapChatContext, V2PersistedDraftState } from '@/types/resume-v2';
import { normalizeRequirement } from './utils/coaching-actions';
import { useHiringManagerReview } from '@/hooks/useHiringManagerReview';
import type { HiringManagerConcern } from '@/hooks/useHiringManagerReview';
import { useToast } from '@/components/Toast';

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

  // Live ATS scoring
  const { scores: liveScores, isScoring, requestRescore, setInitialScores } = useLiveScoring(
    accessToken, data.sessionId, jobDescription,
  );

  // Hiring manager review
  const {
    result: hiringManagerResult,
    isLoading: isHiringManagerLoading,
    error: hiringManagerError,
    requestReview: rawRequestReview,
    reset: resetHiringManagerReview,
  } = useHiringManagerReview(accessToken, data.sessionId);

  // Gap coaching chat
  const gapChat = useGapChat(accessToken, data.sessionId);
  const { resetChat: resetGapChat, acceptLanguage: acceptGapLanguage } = gapChat;
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
        lastPersistedDraftRef.current = JSON.stringify(resolvedDraftState ?? null);
      } else {
        setSessionLoadError('Failed to load session. It may have expired or belong to a different account.');
      }
    })();
  }, [initialSessionId, sessionLoadAttempted, loadSession]);

  const acceptEdit = useCallback((editedText: string) => {
    const acceptedRequirement = pendingEdit?.editContext?.requirement;
    rawAcceptEdit(editedText);
    if (acceptedRequirement) {
      acceptGapLanguage(acceptedRequirement, editedText);
    }
  }, [pendingEdit, rawAcceptEdit, acceptGapLanguage]);

  // Trigger rescore whenever editableResume changes (i.e., after accepting an edit or undo/redo)
  useEffect(() => {
    if (editableResume && isComplete) {
      requestRescore(editableResume);
    }
  }, [editableResume, isComplete, requestRescore]);

  useEffect(() => {
    if (masterSaveMode === 'master_resume') {
      setMasterSaveStatus({
        tone: 'neutral',
        message: 'Future accepted edits will sync to your master resume automatically. Use "Save Current Version Now" to push the current draft immediately.',
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
  }, [masterSaveMode]);

  const persistResumeToMaster = useCallback(async (
    draft: ResumeDraft,
    reason: 'auto' | 'manual',
  ) => {
    if (!onSyncToMasterResume || isSavingToMaster) return false;

    setIsSavingToMaster(true);

    const result = await onSyncToMasterResume(draft, {
      sourceSessionId: data.sessionId || null,
      companyName: data.jobIntelligence?.company_name,
      jobTitle: data.jobIntelligence?.role_title,
      atsScore: liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? undefined,
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

    lastMasterSnapshotRef.current = resumeToPlainText(draft);
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
  ]);

  useEffect(() => {
    if (masterSaveMode !== 'master_resume' || !editableResume || isSavingToMaster) return;

    const snapshot = resumeToPlainText(editableResume);
    if (snapshot === lastMasterSnapshotRef.current) return;

    const timer = window.setTimeout(() => {
      void persistResumeToMaster(editableResume, 'auto');
    }, 500);

    return () => window.clearTimeout(timer);
  }, [editableResume, isSavingToMaster, masterSaveMode, persistResumeToMaster]);

  useEffect(() => {
    if (!data.sessionId || !isComplete) return;

    const nextDraftState: V2PersistedDraftState | null = editableResume || masterSaveMode !== 'session_only'
      ? {
          editable_resume: editableResume,
          master_save_mode: masterSaveMode,
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
  }, [data.sessionId, editableResume, isComplete, masterSaveMode, saveDraftState]);

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
    void start(rt, jd);
  }, [start, resetHistory, resetGapChat]);

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
    void start(resumeText, jobDescription, {
      userContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
      gapCoachingResponses: responses,
      preScores: data.preScores,
    });
  }, [start, resumeText, jobDescription, resetHistory, resetGapChat, data.preScores]);

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
    void start(resumeText, jobDescription, { userContext, preScores: data.preScores });
  }, [start, resumeText, jobDescription, resetHistory, resetGapChat, editableResume, data.assembly, data.resumeDraft, data.preScores]);

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
  }, [reset, resetHiringManagerReview, resetGapChat]);

  const handleSaveCurrentToMaster = useCallback(() => {
    if (!currentResume) return;
    void persistResumeToMaster(currentResume, 'manual');
  }, [currentResume, persistResumeToMaster]);

  // Hiring manager review: build the request from available data
  const handleRequestHiringManagerReview = useCallback(() => {
    if (!currentResume || !data.jobIntelligence) return;
    const serializedResume = resumeToPlainText(currentResume);

    void rawRequestReview({
      resume_text: serializedResume,
      job_description: jobDescription,
      company_name: data.jobIntelligence.company_name,
      role_title: data.jobIntelligence.role_title,
      requirements: data.jobIntelligence.core_competencies.map(c => c.competency),
      hidden_signals: data.jobIntelligence.hidden_hiring_signals,
    });
  }, [currentResume, data.jobIntelligence, jobDescription, rawRequestReview]);

  // Apply a hiring manager concern as an inline edit
  const handleApplyHiringManagerRecommendation = useCallback((concern: HiringManagerConcern) => {
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
    requestEdit(targetText, section, 'custom', concern.recommendation);
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
  const displayAtsScore = liveScores?.ats_score ?? data.assembly?.scores.ats_match ?? null;
  const displayTruthScore = data.assembly?.scores.truth ?? null;
  const displayToneScore = data.assembly?.scores.tone ?? null;

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
        onUndo={undo}
        onRedo={redo}
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
        isHiringManagerLoading={isHiringManagerLoading}
        hiringManagerError={hiringManagerError}
        onRequestHiringManagerReview={handleRequestHiringManagerReview}
        onApplyHiringManagerRecommendation={handleApplyHiringManagerRecommendation}
        gapChat={isComplete ? gapChat : null}
        buildChatContext={isComplete ? buildChatContext : undefined}
        masterSaveMode={masterSaveMode}
        onChangeMasterSaveMode={setMasterSaveMode}
        onSaveCurrentToMaster={handleSaveCurrentToMaster}
        isSavingToMaster={isSavingToMaster}
        masterSaveStatus={masterSaveStatus}
      />
    </div>
  );
}
