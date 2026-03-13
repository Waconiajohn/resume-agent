/**
 * V2ResumeScreen — Main screen for the v2 resume pipeline
 *
 * Two states:
 *   1. Intake — two-field form (resume + JD)
 *   2. Streaming — accumulating output display with inline AI editing + live scoring
 */

import { useState, useCallback, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useV2Pipeline } from '@/hooks/useV2Pipeline';
import { useInlineEdit } from '@/hooks/useInlineEdit';
import { useLiveScoring } from '@/hooks/useLiveScoring';
import { GlassButton } from '../GlassButton';
import { V2IntakeForm } from './V2IntakeForm';
import { V2StreamingDisplay } from './V2StreamingDisplay';
import type { ResumeDraft, GapCoachingResponse } from '@/types/resume-v2';
import type { StrategyApprovals } from './cards/GapAnalysisCard';

interface V2ResumeScreenProps {
  accessToken: string | null;
  onBack: () => void;
  initialResumeText?: string;
}

export function V2ResumeScreen({ accessToken, onBack, initialResumeText }: V2ResumeScreenProps) {
  const { data, isConnected, isComplete, isStarting, error, start, reset, respondToGapCoaching, integrateKeyword } = useV2Pipeline(accessToken);

  // Track the editable resume separately — starts as the pipeline output,
  // then gets mutated by inline edits
  const [editableResume, setEditableResume] = useState<ResumeDraft | null>(null);

  // The resume to use: user-edited version takes precedence over pipeline output
  const currentResume = editableResume ?? data.assembly?.final_resume ?? data.resumeDraft ?? null;

  // Store inputs for inline edit context and re-runs
  const [resumeText, setResumeText] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [strategyApprovals, setStrategyApprovals] = useState<StrategyApprovals>({});

  const {
    pendingEdit, isEditing, editError, undoCount, redoCount,
    requestEdit, acceptEdit: rawAcceptEdit, rejectEdit, undo, redo, resetHistory,
  } = useInlineEdit(accessToken, data.sessionId, currentResume, jobDescription, setEditableResume);

  // Live ATS scoring
  const { scores: liveScores, isScoring, requestRescore, setInitialScores } = useLiveScoring(
    accessToken, data.sessionId, jobDescription,
  );

  // Seed initial scores from pipeline assembly
  useEffect(() => {
    if (data.assembly) {
      setInitialScores(data.assembly.scores.ats_match);
    }
  }, [data.assembly, setInitialScores]);

  const acceptEdit = useCallback((editedText: string) => {
    rawAcceptEdit(editedText);
  }, [rawAcceptEdit]);

  // Trigger rescore whenever editableResume changes (i.e., after accepting an edit or undo/redo)
  useEffect(() => {
    if (editableResume && isComplete) {
      requestRescore(editableResume);
    }
  }, [editableResume, isComplete, requestRescore]);

  const isPipelineActive = data.sessionId !== '';

  const handleSubmit = useCallback((rt: string, jd: string) => {
    setResumeText(rt);
    setJobDescription(jd);
    setEditableResume(null);
    resetHistory();
    void start(rt, jd);
  }, [start, resetHistory]);

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
    setStrategyApprovals({});
    resetHistory();
    void start(resumeText, jobDescription, contextParts.length > 0 ? contextParts.join('\n') : undefined);
  }, [start, resumeText, jobDescription, resetHistory]);

  // Keyword integration: use inline edit with 'add_keywords' action
  // Find the first experience bullet and request an AI edit to add the keyword
  const handleIntegrateKeyword = useCallback((keyword: string) => {
    if (!currentResume) return;
    // Find the first experience entry to use as the target section
    const firstExp = currentResume.professional_experience[0];
    if (!firstExp || firstExp.bullets.length === 0) return;
    // Use the first bullet as a starting point — the AI will find the best fit
    const targetBullet = firstExp.bullets[0].text;
    const section = `Professional Experience - ${firstExp.company}`;
    requestEdit(targetBullet, section, 'add_keywords', `Naturally integrate this specific keyword/phrase into the text: "${keyword}"`);
  }, [currentResume, requestEdit]);

  const handleAddContext = useCallback((userContext: string) => {
    // Include rejected strategies so the pipeline knows what to skip
    const rejected = Object.entries(strategyApprovals)
      .filter(([, approved]) => approved === false)
      .map(([req]) => req);

    const contextParts = [userContext];
    if (rejected.length > 0) {
      contextParts.push(`\nDo NOT use these positioning strategies (user rejected them): ${rejected.join('; ')}`);
    }

    setEditableResume(null);
    setStrategyApprovals({});
    resetHistory();
    void start(resumeText, jobDescription, contextParts.join('\n'));
  }, [start, resumeText, jobDescription, strategyApprovals, resetHistory]);

  const handleStartOver = useCallback(() => {
    reset();
    setEditableResume(null);
    setResumeText('');
    setJobDescription('');
    setStrategyApprovals({});
  }, [reset]);

  if (!isPipelineActive) {
    return (
      <V2IntakeForm
        onSubmit={handleSubmit}
        loading={isStarting}
        error={error}
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
              <span className="text-[#afc4ff]">ATS: {displayAtsScore}%</span>
            </div>
            {displayTruthScore !== null && (
              <span className="text-[#b5dec2]">Truth: {displayTruthScore}%</span>
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
        strategyApprovals={strategyApprovals}
        onStrategyChange={setStrategyApprovals}
        liveScores={liveScores}
        isScoring={isScoring}
        gapCoachingCards={data.gapCoachingCards}
        onRespondGapCoaching={handleGapCoachingRespond}
        preScores={data.preScores}
        onIntegrateKeyword={handleIntegrateKeyword}
      />
    </div>
  );
}
