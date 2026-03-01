/**
 * useSSEEventHandlers.ts
 *
 * Named handler functions for each SSE event type, plus a `createSSEEventRouter`
 * factory that wires them together. Each handler receives the parsed data blob
 * and the state manager bundle from usePipelineStateManager.
 */

import type {
  ChatMessage,
  PipelineStage,
  PositioningQuestion,
  QualityScores,
  DraftReadinessUpdate,
  WorkflowReplanUpdate,
  PipelineActivitySnapshot,
  CategoryProgress,
} from '@/types/session';
import type { FinalResume } from '@/types/resume';
import type { PanelType, PanelData } from '@/types/panels';
import { requestNotificationPermission, sendGateNotification } from '@/lib/notifications';
import { sanitizeSectionContextPayload, asReplanStaleNodes, safeParse } from '@/hooks/useSSEDataValidation';
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAX_TOOL_STATUS_ENTRIES = 20;

/**
 * Validates a pipeline stage string.
 */
function asPipelineStage(value: unknown): PipelineStage | undefined {
  const VALID: PipelineStage[] = [
    'intake',
    'positioning',
    'research',
    'gap_analysis',
    'architect',
    'architect_review',
    'section_writing',
    'section_review',
    'quality_review',
    'revision',
    'complete',
  ];
  if (typeof value === 'string' && VALID.includes(value as PipelineStage)) {
    return value as PipelineStage;
  }
  return undefined;
}

// ─── Individual handlers ──────────────────────────────────────────────────────

export function handleConnected(state: PipelineStateManager): void {
  state.setConnected(true);
  state.setError(null);
  state.reconnectAttemptsRef.current = 0;
  state.patchPipelineActivityMeta({
    processing_state: state.isProcessingRef.current ? 'processing' : 'idle',
    current_activity_message: state.isProcessingRef.current
      ? 'Live stream connected. Waiting for the next backend update...'
      : 'Live stream connected.',
    current_activity_source: 'system',
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSessionRestore(data: Record<string, any>, state: PipelineStateManager): void {
  const pipelineRunning = data.pipeline_status === 'running';
  const pendingGate = typeof data.pending_gate === 'string' ? data.pending_gate : null;
  if (data.pipeline_stage && typeof data.pipeline_stage === 'string') {
    state.setPipelineStage(data.pipeline_stage as PipelineStage);
    state.setCurrentPhase(data.pipeline_stage as string);
  } else if (data.current_phase) {
    state.setCurrentPhase(data.current_phase as string);
  }
  if (Array.isArray(data.messages) && data.messages.length) {
    try {
      const restored: ChatMessage[] = (
        data.messages as Array<{ role: string; content: string }>
      )
        .filter(
          (m) =>
            m && typeof m.role === 'string' && typeof m.content === 'string',
        )
        .map((m, i) => ({
          id: `restored-${i}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date().toISOString(),
        }));
      state.setMessages(restored);
      state.messageIdRef.current = restored.length;
    } catch (err) {
      console.error('[useAgent] Failed to restore messages:', err);
    }
  }
  if (data.last_panel_type && data.last_panel_data) {
    state.setPanelType(data.last_panel_type as PanelType);
    const panelPayload = data.last_panel_data as Record<string, unknown>;
    state.setPanelData({
      type: data.last_panel_type,
      ...panelPayload,
    } as PanelData);
    if (data.last_panel_type === 'completion' && panelPayload.resume) {
      state.setResume(panelPayload.resume as FinalResume);
    }
  }
  state.setIsPipelineGateActive(Boolean(pipelineRunning && pendingGate));
  state.setIsProcessing(Boolean(pipelineRunning && !pendingGate));
  state.setAskPrompt(null);
  state.patchPipelineActivityMeta({
    processing_state: pendingGate
      ? 'waiting_for_input'
      : pipelineRunning
        ? 'reconnecting'
        : 'idle',
    stage:
      typeof data.pipeline_stage === 'string'
        ? (data.pipeline_stage as PipelineStage)
        : null,
    current_activity_message: pendingGate
      ? 'Session restored. Waiting for your input on the current workflow action.'
      : pipelineRunning
        ? 'Session restored. Waiting for live backend updates.'
        : 'Session restored.',
    current_activity_source: 'restore',
    expected_next_action: pendingGate
      ? 'Complete the active workflow action in the workspace'
      : null,
  });
  if (data.pending_phase_transition && data.pending_tool_call_id) {
    const restorePhase = (
      typeof data.pipeline_stage === 'string'
        ? data.pipeline_stage
        : data.current_phase
    ) as string;
    state.setPhaseGate({
      toolCallId: data.pending_tool_call_id as string,
      currentPhase: restorePhase,
      nextPhase: data.pending_phase_transition as string,
      phaseSummary: 'Phase complete (restored after reconnect)',
      nextPhasePreview: '',
    });
  } else {
    state.setPhaseGate(null);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleTextDelta(
  data: Record<string, any>,
  state: PipelineStateManager,
  flushDeltaBuffer: () => void,
): void {
  state.deltaBufferRef.current += data.content;
  if (state.rafIdRef.current === null) {
    state.rafIdRef.current = requestAnimationFrame(flushDeltaBuffer);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleTextComplete(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  // Deduplicate: prefer server sequence number, fall back to content equality
  if (typeof data.seq === 'number') {
    if (data.seq <= state.lastSeqRef.current) return;
    state.lastSeqRef.current = data.seq;
  } else {
    if (data.content === state.lastTextCompleteRef.current) return;
  }
  state.lastTextCompleteRef.current = data.content;

  // Flush any remaining buffered deltas before completing
  if (state.deltaBufferRef.current) {
    state.deltaBufferRef.current = '';
    if (state.rafIdRef.current !== null) {
      cancelAnimationFrame(state.rafIdRef.current);
      state.rafIdRef.current = null;
    }
  }

  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'assistant',
      content: data.content,
      timestamp: new Date().toISOString(),
    },
  ]);
  state.setStreamingText('');
  state.setIsProcessing(false);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleToolStart(data: Record<string, any>, state: PipelineStateManager): void {
  state.setTools((prev) => {
    const next = [
      ...prev,
      {
        name: data.tool_name,
        description: data.description,
        status: 'running' as const,
      },
    ];
    return next.length > MAX_TOOL_STATUS_ENTRIES ? next.slice(-MAX_TOOL_STATUS_ENTRIES) : next;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleToolComplete(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const toolName = data.tool_name as string;
  state.setTools((prev) =>
    prev.map((t) =>
      t.name === toolName && t.status === 'running'
        ? { ...t, status: 'complete' as const, summary: data.summary as string }
        : t,
    ),
  );
  const timer = setTimeout(() => {
    if (!state.mountedRef.current) return;
    state.setTools((prev) =>
      prev.filter((t) => !(t.name === toolName && t.status === 'complete')),
    );
    state.toolCleanupTimersRef.current.delete(timer);
  }, 3000);
  state.toolCleanupTimersRef.current.add(timer);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleAskUser(data: Record<string, any>, state: PipelineStateManager): void {
  state.patchPipelineActivityMeta({
    processing_state: 'waiting_for_input',
    current_activity_message:
      'A response is required in the right-column chat before the workflow can continue.',
    current_activity_source: 'gate',
    expected_next_action: 'Answer the prompt in this chat panel',
  });
  state.setIsProcessing(false);
  state.setAskPrompt({
    toolCallId: data.tool_call_id,
    question: data.question,
    context: data.context,
    inputType: data.input_type,
    choices: data.choices,
    skipAllowed: data.skip_allowed,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePhaseGate(data: Record<string, any>, state: PipelineStateManager): void {
  state.patchPipelineActivityMeta({
    processing_state: 'waiting_for_input',
    current_activity_message:
      'Phase transition confirmation is waiting for your input.',
    current_activity_source: 'gate',
    expected_next_action: 'Confirm the phase transition in this chat panel',
  });
  state.setIsProcessing(false);
  state.setPhaseGate({
    toolCallId: data.tool_call_id,
    currentPhase: data.current_phase,
    nextPhase: data.next_phase,
    phaseSummary: data.phase_summary,
    nextPhasePreview: data.next_phase_preview,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRightPanelUpdate(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const incomingType = data.panel_type as PanelType;
  state.setPanelType(incomingType);

  state.setPanelData((prev) => {
    const incoming = { type: incomingType, ...data.data } as PanelData;

    // Merge onboarding_summary to preserve stat cards
    if (incomingType === 'onboarding_summary' && prev?.type === 'onboarding_summary') {
      return { ...prev, ...incoming } as PanelData;
    }

    // Accumulate live_resume changes for same section
    if (incomingType === 'live_resume' && prev?.type === 'live_resume') {
      const prevData = prev as PanelData & {
        active_section?: string;
        changes?: unknown[];
      };
      const incomingData = incoming as PanelData & {
        active_section?: string;
        changes?: unknown[];
      };
      if (
        prevData.active_section === incomingData.active_section &&
        incomingData.changes
      ) {
        const existingChanges = prevData.changes ?? [];
        const newChanges = incomingData.changes ?? [];
        const existingOriginals = new Set(
          (existingChanges as Array<{ original?: string }>).map(
            (c) => c.original ?? '',
          ),
        );
        const merged = [
          ...existingChanges,
          ...(newChanges as Array<{ original?: string }>).filter(
            (c) => !existingOriginals.has(c.original ?? ''),
          ),
        ];
        return { ...incomingData, changes: merged } as PanelData;
      }
    }

    return incoming;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePhaseChange(data: Record<string, any>, state: PipelineStateManager): void {
  state.patchPipelineActivityMeta({
    processing_state: data.to_phase === 'complete' ? 'complete' : 'processing',
    current_activity_message: `Phase changed to ${String(data.to_phase).replace(/_/g, ' ')}.`,
    current_activity_source: 'system',
    expected_next_action: null,
  });
  state.setCurrentPhase(data.to_phase);
  state.setPhaseGate(null);
  state.setAskPrompt(null);
  state.setTools([]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleTransparency(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.message === 'string'
      ? data.message
      : 'Backend is working on this step.',
    'transparency',
    { stage: asPipelineStage(data.stage) },
  );
  state.setIsProcessing(true);
  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'system',
      content: data.message,
      timestamp: new Date().toISOString(),
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleResumeUpdate(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const content =
    typeof data.content === 'object' && data.content !== null
      ? JSON.stringify(data.content)
      : data.content;
  state.setResume((prev) => {
    const base = prev ?? {
      summary: '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 0,
    };
    return { ...base, [data.section]: content };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleExportReady(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  state.setResume(data.resume);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleComplete(
  data: Record<string, any> | null,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
  abortCurrentConnection: () => void,
): void {
  markPipelineProgress(
    'Session complete. Final outputs are ready.',
    'stage_complete',
    {
      stage: 'complete',
      expectedNextAction: 'Review the final resume and export options',
    },
  );
  state.setIsPipelineGateActive(false);
  state.setIsProcessing(false);
  state.setSessionComplete(true);
  state.setCurrentPhase('complete');
  state.setPanelType('completion');
  state.setPanelData({
    type: 'completion',
    ats_score: (data?.ats_score as number) ?? undefined,
    requirements_addressed: (data?.requirements_addressed as number) ?? undefined,
    sections_rewritten: (data?.sections_rewritten as number) ?? undefined,
  });
  abortCurrentConnection();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleError(
  data: Record<string, any> | null,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  let errorMsg = data?.message ?? data?.error?.message ?? 'Something went wrong';
  if (typeof errorMsg === 'string' && errorMsg.startsWith('{')) {
    errorMsg = 'Something went wrong processing your message. Please try again.';
  }
  markPipelineProgress(
    typeof errorMsg === 'string' ? `Session error: ${errorMsg}` : 'Session error',
    'system',
    { expectedNextAction: 'Reconnect or refresh the workspace before retrying' },
  );
  state.setIsPipelineGateActive(false);
  state.setError(errorMsg as string);
  state.setIsProcessing(false);
}

export function handleHeartbeat(state: PipelineStateManager): void {
  if (state.isProcessingRef.current) {
    state.setPipelineActivityMeta((prev) => ({
      ...prev,
      current_activity_message:
        prev.processing_state !== 'waiting_for_input'
          ? (prev.current_activity_message ??
            'Backend heartbeat received. Processing is still running.')
          : prev.current_activity_message,
      current_activity_source:
        prev.processing_state !== 'waiting_for_input'
          ? (prev.current_activity_source ?? 'system')
          : prev.current_activity_source,
    }));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStageStart(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  const stageStartAt = new Date().toISOString();
  markPipelineProgress(
    typeof data.message === 'string' ? data.message : 'Starting next workflow step.',
    'stage_start',
    {
      stage: data.stage as PipelineStage,
      stageStartedAt: stageStartAt,
    },
  );
  state.setIsPipelineGateActive(false);
  state.setPipelineStage(data.stage as PipelineStage);
  state.setCurrentPhase(data.stage as string);
  state.setIsProcessing(true);
  state.setPipelineActivityMeta((prev) => ({
    ...prev,
    last_stage_duration_ms: null,
  }));
  if (data.stage === 'intake') {
    requestNotificationPermission();
  }
  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'system',
      content: data.message,
      timestamp: new Date().toISOString(),
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleStageComplete(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.message === 'string' ? data.message : 'Workflow step completed.',
    'stage_complete',
    { stage: data.stage as PipelineStage },
  );
  state.setPipelineStage(data.stage as PipelineStage);
  state.setIsProcessing(false);
  state.setPipelineActivityMeta((prev) => ({
    ...prev,
    last_stage_duration_ms: Number.isFinite(data.duration_ms as number)
      ? Math.max(0, Number(data.duration_ms))
      : prev.last_stage_duration_ms ?? null,
  }));
  if (data.duration_ms && import.meta.env.DEV) {
    console.log(
      `[pipeline] ${data.stage} completed in ${((data.duration_ms as number) / 1000).toFixed(1)}s`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePositioningQuestion(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    'Step 3 question is ready. Waiting for your answer.',
    'gate',
    {
      stage: 'positioning',
      expectedNextAction: 'Answer the Why Me question in the workspace',
    },
  );
  state.setIsProcessing(false);
  state.setIsPipelineGateActive(true);
  const q = data.question as PositioningQuestion;
  state.setPositioningQuestion(q);
  state.setPanelType('positioning_interview');
  state.setPanelData({
    type: 'positioning_interview',
    current_question: q,
    questions_total: (data.questions_total as number) ?? q.question_number,
    questions_answered: q.question_number - 1,
    category_progress: data.category_progress as CategoryProgress[] | undefined,
    encouraging_text: q.encouraging_text,
  } as PanelData);
  sendGateNotification('Interview question is ready');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleQuestionnaire(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.title === 'string' && data.title.trim().length > 0
      ? `${data.title} is ready for your input.`
      : 'A questionnaire is ready for your input.',
    'gate',
    { expectedNextAction: 'Complete the questionnaire in the workspace' },
  );
  state.setIsProcessing(false);
  state.setIsPipelineGateActive(true);
  state.setPanelType('questionnaire');
  state.setPanelData({
    type: 'questionnaire',
    questionnaire_id: data.questionnaire_id,
    schema_version: data.schema_version,
    stage: data.stage,
    title: data.title,
    subtitle: data.subtitle,
    questions: data.questions,
    current_index: data.current_index ?? 0,
  } as PanelData);
  sendGateNotification('A questionnaire is ready for you');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePositioningProfileFound(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  state.setIsPipelineGateActive(true);
  markPipelineProgress(
    'A saved positioning profile is available. Choose whether to use it, update it, or start fresh.',
    'gate',
    {
      stage: 'positioning',
      expectedNextAction: 'Choose how to start Step 3',
    },
  );
  state.setIsProcessing(false);
  state.setPositioningProfileFound({
    profile: data.profile,
    updated_at: data.updated_at,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleBlueprintReady(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress('Step 5 blueprint is ready for review.', 'gate', {
    stage: 'architect_review',
    expectedNextAction: 'Review and approve the blueprint in the workspace',
  });
  state.setIsProcessing(false);
  state.setIsPipelineGateActive(true);
  state.setBlueprintReady(data.blueprint);
  const bp = data.blueprint as Record<string, unknown>;
  state.setPanelType('blueprint_review');
  state.setPanelData({
    type: 'blueprint_review',
    target_role: (bp.target_role as string) ?? '',
    positioning_angle: (bp.positioning_angle as string) ?? '',
    section_plan: bp.section_plan as { order: string[]; rationale: string },
    age_protection: bp.age_protection as {
      flags: Array<{ item: string; risk: string; action: string }>;
      clean: boolean;
    },
    evidence_allocation_count: (
      (bp.evidence_allocation as Record<string, unknown>)
        ?.selected_accomplishments as unknown[] ?? []
    ).length,
    keyword_count: Object.keys((bp.keyword_map as Record<string, unknown>) ?? {}).length,
  } as PanelData);
  sendGateNotification('Blueprint is ready for your review');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSectionContext(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const sanitized = sanitizeSectionContextPayload(data);
  if (!sanitized) return;
  const current = state.sectionContextRef.current;
  if (
    current &&
    current.section === sanitized.section &&
    sanitized.context.context_version <= current.context.context_version
  ) {
    return; // Ignore stale or same-version context
  }
  const dismissed = state.dismissedSuggestionIdsRef.current;
  if (dismissed.size > 0 && sanitized.context.suggestions) {
    const filtered = sanitized.context.suggestions.filter((s) => !dismissed.has(s.id));
    sanitized.context.suggestions = filtered.length > 0 ? filtered : undefined;
  }
  state.sectionContextRef.current = sanitized;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSectionDraft(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.section === 'string'
      ? `Section draft ready: ${data.section}`
      : 'A section draft is ready for review.',
    'gate',
    {
      stage: 'section_review',
      expectedNextAction: 'Review the section draft in Step 6',
    },
  );
  state.setIsProcessing(false);
  state.setIsPipelineGateActive(true);
  const section = data.section as string;
  const content = data.content as string;
  state.setSectionDraft({ section, content });
  state.sectionsMapRef.current[section] = content;
  const contextForSection =
    state.sectionContextRef.current?.section === section
      ? state.sectionContextRef.current.context
      : null;
  state.setPanelType('section_review' as PanelType);
  state.setPanelData({
    type: 'section_review',
    section,
    content,
    review_token: (data.review_token as string | undefined) ?? undefined,
    ...(contextForSection ? { context: contextForSection } : {}),
  } as PanelData);
  sendGateNotification('Section is ready for review');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSectionRevised(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.section === 'string'
      ? `Updated section after quality review: ${data.section}`
      : 'Updated a section after quality review.',
    'system',
    { stage: 'revision' },
  );
  const section = data.section as string;
  const content = data.content as string;
  state.setSectionDraft({ section, content });
  state.sectionsMapRef.current[section] = content;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSectionApproved(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const section = data.section as string;
  if (section && state.sectionsMapRef.current[section]) {
    state.setApprovedSections((prev) => ({
      ...prev,
      [section]: state.sectionsMapRef.current[section],
    }));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleQualityScores(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress('Step 7 quality review scores are ready.', 'system', {
    stage: 'quality_review',
  });
  const scores = data.scores as QualityScores;
  state.setQualityScores(scores);
  state.qualityScoresRef.current = scores;
  const details = (data.details ?? {}) as Record<string, unknown>;
  state.setPanelType('quality_dashboard');
  state.setPanelData({
    type: 'quality_dashboard',
    ats_score: scores.ats_score,
    authenticity_score: scores.authenticity,
    evidence_integrity: scores.evidence_integrity,
    blueprint_compliance: scores.blueprint_compliance,
    narrative_coherence:
      typeof details.narrative_coherence === 'number'
        ? details.narrative_coherence
        : undefined,
    hiring_manager: {
      pass: scores.hiring_manager_impact >= 4,
      checklist_total: scores.hiring_manager_impact,
      checklist_max: 5,
    },
    keyword_coverage: scores.requirement_coverage,
    ats_findings: Array.isArray(details.ats_findings)
      ? (details.ats_findings as Array<{ issue: string; priority: string }>)
      : undefined,
    humanize_issues: Array.isArray(details.humanize_issues)
      ? (details.humanize_issues as string[])
      : undefined,
    coherence_issues: Array.isArray(details.coherence_issues)
      ? (details.coherence_issues as string[])
      : undefined,
  } as PanelData);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleDraftReadiness(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const gapBreakdownRaw =
    data.gap_breakdown &&
    typeof data.gap_breakdown === 'object' &&
    !Array.isArray(data.gap_breakdown)
      ? (data.gap_breakdown as Record<string, unknown>)
      : null;
  const evidenceQualityRaw =
    data.evidence_quality &&
    typeof data.evidence_quality === 'object' &&
    !Array.isArray(data.evidence_quality)
      ? (data.evidence_quality as Record<string, unknown>)
      : null;
  const highImpactRemaining: DraftReadinessUpdate['high_impact_remaining'] =
    Array.isArray(data.high_impact_remaining)
      ? data.high_impact_remaining
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) && typeof item === 'object' && !Array.isArray(item),
          )
          .map((item) => {
            const priority: 'must_have' | 'implicit' | 'nice_to_have' =
              item.priority === 'must_have' ||
              item.priority === 'implicit' ||
              item.priority === 'nice_to_have'
                ? item.priority
                : 'nice_to_have';
            return {
              requirement:
                typeof item.requirement === 'string' ? item.requirement : '',
              classification: (item.classification === 'partial'
                ? 'partial'
                : 'gap') as 'partial' | 'gap',
              priority,
              evidence_count: Number.isFinite(item.evidence_count as number)
                ? Math.max(0, Number(item.evidence_count))
                : 0,
            };
          })
          .filter((item) => item.requirement.length > 0)
      : undefined;
  const blockingReasons = Array.isArray(data.blocking_reasons)
    ? data.blocking_reasons.filter(
        (reason): reason is 'coverage_threshold' => reason === 'coverage_threshold',
      )
    : undefined;

  state.setDraftReadiness({
    stage: (data.stage as PipelineStage) ?? 'gap_analysis',
    workflow_mode:
      data.workflow_mode === 'fast_draft' || data.workflow_mode === 'deep_dive'
        ? data.workflow_mode
        : 'balanced',
    evidence_count: Number.isFinite(data.evidence_count as number)
      ? Number(data.evidence_count)
      : 0,
    minimum_evidence_target: Number.isFinite(data.minimum_evidence_target as number)
      ? Number(data.minimum_evidence_target)
      : 0,
    coverage_score: Number.isFinite(data.coverage_score as number)
      ? Number(data.coverage_score)
      : 0,
    coverage_threshold: Number.isFinite(data.coverage_threshold as number)
      ? Number(data.coverage_threshold)
      : 0,
    ready: data.ready === true,
    remaining_evidence_needed: Number.isFinite(data.remaining_evidence_needed as number)
      ? Math.max(0, Number(data.remaining_evidence_needed))
      : undefined,
    remaining_coverage_needed: Number.isFinite(data.remaining_coverage_needed as number)
      ? Math.max(0, Number(data.remaining_coverage_needed))
      : undefined,
    blocking_reasons: blockingReasons,
    gap_breakdown: gapBreakdownRaw
      ? {
          total: Number.isFinite(gapBreakdownRaw.total as number)
            ? Math.max(0, Number(gapBreakdownRaw.total))
            : 0,
          strong: Number.isFinite(gapBreakdownRaw.strong as number)
            ? Math.max(0, Number(gapBreakdownRaw.strong))
            : 0,
          partial: Number.isFinite(gapBreakdownRaw.partial as number)
            ? Math.max(0, Number(gapBreakdownRaw.partial))
            : 0,
          gap: Number.isFinite(gapBreakdownRaw.gap as number)
            ? Math.max(0, Number(gapBreakdownRaw.gap))
            : 0,
        }
      : undefined,
    evidence_quality: evidenceQualityRaw
      ? {
          user_validated_count: Number.isFinite(
            evidenceQualityRaw.user_validated_count as number,
          )
            ? Math.max(0, Number(evidenceQualityRaw.user_validated_count))
            : 0,
          metrics_defensible_count: Number.isFinite(
            evidenceQualityRaw.metrics_defensible_count as number,
          )
            ? Math.max(0, Number(evidenceQualityRaw.metrics_defensible_count))
            : 0,
          mapped_requirement_evidence_count: Number.isFinite(
            evidenceQualityRaw.mapped_requirement_evidence_count as number,
          )
            ? Math.max(0, Number(evidenceQualityRaw.mapped_requirement_evidence_count))
            : 0,
        }
      : undefined,
    high_impact_remaining: highImpactRemaining,
    suggested_question_count: Number.isFinite(data.suggested_question_count as number)
      ? Math.max(0, Number(data.suggested_question_count))
      : undefined,
    note: typeof data.note === 'string' ? data.note : undefined,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleWorkflowReplanRequested(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.message === 'string'
      ? data.message
      : 'Benchmark assumptions changed. Downstream work will replan at the next safe checkpoint.',
    'system',
    {
      stage: data.current_stage as PipelineStage | undefined,
      expectedNextAction:
        data.requires_restart === true
          ? 'Restart and rebuild from the workspace banner'
          : 'Wait for the pipeline to reach a safe checkpoint',
    },
  );
  state.setWorkflowReplan({
    state: 'requested',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
      ? Number(data.benchmark_edit_version)
      : 0,
    rebuild_from_stage: 'gap_analysis',
    requires_restart: data.requires_restart === true,
    current_stage: (data.current_stage as PipelineStage | undefined) ?? 'research',
    stale_nodes: asReplanStaleNodes(data.stale_nodes),
    message: typeof data.message === 'string' ? data.message : undefined,
    updated_at: new Date().toISOString(),
  } as WorkflowReplanUpdate);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleWorkflowReplanStarted(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.message === 'string'
      ? data.message
      : 'Applying benchmark updates and rebuilding downstream steps.',
    'system',
    { stage: data.current_stage as PipelineStage | undefined },
  );
  state.setWorkflowReplan((prev) => ({
    state: 'in_progress',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
      ? Number(data.benchmark_edit_version)
      : (prev?.benchmark_edit_version ?? 0),
    rebuild_from_stage: 'gap_analysis',
    requires_restart: prev?.requires_restart,
    current_stage:
      (data.current_stage as PipelineStage | undefined) ??
      prev?.current_stage ??
      'research',
    phase:
      data.phase === 'apply_benchmark_overrides' ||
      data.phase === 'refresh_gap_analysis' ||
      data.phase === 'rebuild_blueprint'
        ? data.phase
        : prev?.phase,
    stale_nodes: asReplanStaleNodes(data.stale_nodes) ?? prev?.stale_nodes,
    message: typeof data.message === 'string' ? data.message : undefined,
    updated_at: new Date().toISOString(),
  } as WorkflowReplanUpdate));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleWorkflowReplanCompleted(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data.message === 'string'
      ? data.message
      : 'Benchmark replan completed for the current run.',
    'system',
    { stage: data.current_stage as PipelineStage | undefined },
  );
  state.setWorkflowReplan((prev) => ({
    state: 'completed',
    reason: 'benchmark_assumptions_updated',
    benchmark_edit_version: Number.isFinite(data.benchmark_edit_version as number)
      ? Number(data.benchmark_edit_version)
      : (prev?.benchmark_edit_version ?? 0),
    rebuild_from_stage: 'gap_analysis',
    requires_restart: false,
    current_stage:
      (data.current_stage as PipelineStage | undefined) ??
      prev?.current_stage ??
      'research',
    phase: prev?.phase,
    rebuilt_through_stage:
      data.rebuilt_through_stage === 'research' ||
      data.rebuilt_through_stage === 'gap_analysis' ||
      data.rebuilt_through_stage === 'architect'
        ? data.rebuilt_through_stage
        : prev?.rebuilt_through_stage,
    stale_nodes: asReplanStaleNodes(data.stale_nodes) ?? prev?.stale_nodes,
    message: typeof data.message === 'string' ? data.message : undefined,
    updated_at: new Date().toISOString(),
  } as WorkflowReplanUpdate));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleRevisionStart(
  data: Record<string, any>,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    'Applying quality-review revisions to resume sections.',
    'system',
    { stage: 'revision' },
  );
  state.setIsProcessing(true);
  const instructionCount = Array.isArray(data.instructions) ? data.instructions.length : 0;
  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'system',
      content: `Revising ${instructionCount} sections based on quality review...`,
      timestamp: new Date().toISOString(),
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSystemMessage(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const content = (data.content as string | undefined)?.trim();
  if (!content) return;
  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'system',
      content,
      timestamp: new Date().toISOString(),
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handleSectionError(
  data: Record<string, any>,
  state: PipelineStateManager,
): void {
  const section = (data.section as string | undefined) ?? 'section';
  const err = (data.error as string | undefined) ?? 'Unknown error';
  state.setMessages((prev) => [
    ...prev,
    {
      id: state.nextId(),
      role: 'system',
      content: `Section issue (${section}): ${err}. Fallback content was used so the pipeline could continue.`,
      timestamp: new Date().toISOString(),
    },
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePipelineComplete(
  data: Record<string, any> | null,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    'Resume pipeline complete. Final resume and export checks are ready.',
    'stage_complete',
    {
      stage: 'complete',
      expectedNextAction: 'Review Step 7 results and export your resume',
    },
  );
  state.setIsPipelineGateActive(false);
  state.setIsProcessing(false);
  state.setSessionComplete(true);
  state.setPipelineStage('complete');

  if (data?.resume && typeof data.resume === 'object') {
    state.setResume(data.resume as FinalResume);
  } else {
    const sections = state.sectionsMapRef.current;
    const contactInfo = data?.contact_info as FinalResume['contact_info'] | undefined;
    const companyName = data?.company_name as string | undefined;
    const builtResume: FinalResume = {
      contact_info: contactInfo ?? undefined,
      company_name: companyName ?? undefined,
      summary: sections.summary ?? '',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      selected_accomplishments: sections.selected_accomplishments ?? '',
      ats_score: 0,
      section_order: Object.keys(sections),
      _raw_sections: sections,
    };
    state.setResume(builtResume);
  }

  state.setPanelType('completion');
  state.setPanelData({
    type: 'completion',
    ats_score: (data?.resume as { ats_score?: number } | undefined)?.ats_score,
    keyword_coverage: state.qualityScoresRef.current?.requirement_coverage,
    authenticity_score: state.qualityScoresRef.current?.authenticity,
    export_validation: data?.export_validation as
      | {
          passed: boolean;
          findings: Array<{
            section: string;
            issue: string;
            instruction: string;
            priority: 'high' | 'medium' | 'low';
          }>;
        }
      | undefined,
  } as PanelData);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function handlePipelineError(
  data: Record<string, any> | null,
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
): void {
  markPipelineProgress(
    typeof data?.error === 'string'
      ? `Pipeline error: ${data.error}`
      : 'Pipeline error',
    'system',
    {
      stage: asPipelineStage(data?.stage),
      expectedNextAction:
        'Reconnect or refresh state before restarting the pipeline',
    },
  );
  state.setIsPipelineGateActive(false);
  state.setIsProcessing(false);
  state.setError((data?.error as string) ?? 'Pipeline error');
}

// ─── markPipelineProgress type ───────────────────────────────────────────────

export type MarkPipelineProgressFn = (
  message: string | null | undefined,
  source: PipelineActivitySnapshot['current_activity_source'],
  options?: {
    stage?: PipelineStage | null;
    stageStartedAt?: string | null;
    expectedNextAction?: string | null;
  },
) => void;

// ─── Router factory ───────────────────────────────────────────────────────────

/**
 * Creates a single dispatcher function that routes SSE event type strings to
 * their corresponding handler.
 *
 * markPipelineProgress and flushDeltaBuffer must be stable references
 * (constructed in the calling hook).
 */
export function createSSEEventRouter(
  state: PipelineStateManager,
  markPipelineProgress: MarkPipelineProgressFn,
  flushDeltaBuffer: () => void,
  abortCurrentConnection: () => void,
): (eventType: string, rawData: string) => void {
  return function handleSSEEvent(eventType: string, rawData: string): void {
    // Update last backend activity timestamp for every event (done externally too,
    // but keeping it inside the router makes the logic self-contained for tests)

    switch (eventType) {
      case 'connected': {
        handleConnected(state);
        break;
      }

      case 'session_restore': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSessionRestore(data, state);
        break;
      }

      case 'text_delta': {
        const data = safeParse(rawData);
        if (!data) break;
        handleTextDelta(data, state, flushDeltaBuffer);
        break;
      }

      case 'text_complete': {
        const data = safeParse(rawData);
        if (!data) break;
        handleTextComplete(data, state);
        break;
      }

      case 'tool_start': {
        const data = safeParse(rawData);
        if (!data) break;
        handleToolStart(data, state);
        break;
      }

      case 'tool_complete': {
        const data = safeParse(rawData);
        if (!data) break;
        handleToolComplete(data, state);
        break;
      }

      case 'ask_user': {
        const data = safeParse(rawData);
        if (!data) break;
        handleAskUser(data, state);
        break;
      }

      case 'phase_gate': {
        const data = safeParse(rawData);
        if (!data) break;
        handlePhaseGate(data, state);
        break;
      }

      case 'right_panel_update': {
        const data = safeParse(rawData);
        if (!data) break;
        handleRightPanelUpdate(data, state);
        break;
      }

      case 'phase_change': {
        const data = safeParse(rawData);
        if (!data) break;
        handlePhaseChange(data, state);
        break;
      }

      case 'transparency': {
        const data = safeParse(rawData);
        if (!data) break;
        handleTransparency(data, state, markPipelineProgress);
        break;
      }

      case 'resume_update': {
        const data = safeParse(rawData);
        if (!data) break;
        handleResumeUpdate(data, state);
        break;
      }

      case 'export_ready': {
        const data = safeParse(rawData);
        if (!data) break;
        handleExportReady(data, state);
        break;
      }

      case 'section_status':
      case 'score_change':
        // Tracked server-side — ignore silently
        break;

      case 'complete': {
        const data = safeParse(rawData);
        handleComplete(data, state, markPipelineProgress, abortCurrentConnection);
        break;
      }

      case 'error': {
        const data = safeParse(rawData);
        handleError(data, state, markPipelineProgress);
        break;
      }

      case 'heartbeat': {
        handleHeartbeat(state);
        break;
      }

      case 'stage_start': {
        const data = safeParse(rawData);
        if (!data) break;
        handleStageStart(data, state, markPipelineProgress);
        break;
      }

      case 'stage_complete': {
        const data = safeParse(rawData);
        if (!data) break;
        handleStageComplete(data, state, markPipelineProgress);
        break;
      }

      case 'positioning_question': {
        const data = safeParse(rawData);
        if (!data) break;
        handlePositioningQuestion(data, state, markPipelineProgress);
        break;
      }

      case 'questionnaire': {
        const data = safeParse(rawData);
        if (!data) break;
        handleQuestionnaire(data, state, markPipelineProgress);
        break;
      }

      case 'positioning_profile_found': {
        const data = safeParse(rawData);
        if (!data) break;
        handlePositioningProfileFound(data, state, markPipelineProgress);
        break;
      }

      case 'blueprint_ready': {
        const data = safeParse(rawData);
        if (!data) break;
        handleBlueprintReady(data, state, markPipelineProgress);
        break;
      }

      case 'section_context': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSectionContext(data, state);
        break;
      }

      case 'section_draft': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSectionDraft(data, state, markPipelineProgress);
        break;
      }

      case 'section_revised': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSectionRevised(data, state, markPipelineProgress);
        break;
      }

      case 'section_approved': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSectionApproved(data, state);
        break;
      }

      case 'quality_scores': {
        const data = safeParse(rawData);
        if (!data) break;
        handleQualityScores(data, state, markPipelineProgress);
        break;
      }

      case 'draft_readiness_update': {
        const data = safeParse(rawData);
        if (!data) break;
        handleDraftReadiness(data, state);
        break;
      }

      case 'workflow_replan_requested': {
        const data = safeParse(rawData);
        if (!data) break;
        handleWorkflowReplanRequested(data, state, markPipelineProgress);
        break;
      }

      case 'workflow_replan_started': {
        const data = safeParse(rawData);
        if (!data) break;
        handleWorkflowReplanStarted(data, state, markPipelineProgress);
        break;
      }

      case 'workflow_replan_completed': {
        const data = safeParse(rawData);
        if (!data) break;
        handleWorkflowReplanCompleted(data, state, markPipelineProgress);
        break;
      }

      case 'revision_start': {
        const data = safeParse(rawData);
        if (!data) break;
        handleRevisionStart(data, state, markPipelineProgress);
        break;
      }

      case 'system_message': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSystemMessage(data, state);
        break;
      }

      case 'section_error': {
        const data = safeParse(rawData);
        if (!data) break;
        handleSectionError(data, state);
        break;
      }

      case 'pipeline_complete': {
        const data = safeParse(rawData);
        handlePipelineComplete(data, state, markPipelineProgress);
        break;
      }

      case 'pipeline_error': {
        const data = safeParse(rawData);
        handlePipelineError(data, state, markPipelineProgress);
        break;
      }

      case 'draft_path_decision':
      case 'questionnaire_reuse_summary':
        // Handled via workflow REST API — ignore silently.
        break;

      default: {
        console.warn('[useAgent] Unknown SSE event:', eventType);
        break;
      }
    }
  };
}
