/**
 * Tests for useSSEEventHandlers.ts
 *
 * Each handler is a plain function that accepts parsed data and a
 * PipelineStateManager mock. We assert the correct setters are called
 * with the correct arguments.
 *
 * Environment: node (default for .test.ts).
 * No React rendering is needed — all handlers are pure functions.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Polyfill requestAnimationFrame for Node test environment
beforeAll(() => {
  if (typeof globalThis.requestAnimationFrame === 'undefined') {
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      return setTimeout(() => cb(Date.now()), 0) as unknown as number;
    };
    (globalThis as Record<string, unknown>).cancelAnimationFrame = (id: number) => {
      clearTimeout(id);
    };
  }
});
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';
import type { MarkPipelineProgressFn } from '@/hooks/useSSEEventHandlers';
import {
  handleConnected,
  handleSessionRestore,
  handleTextDelta,
  handleTextComplete,
  handleToolStart,
  handleToolComplete,
  handleAskUser,
  handlePhaseGate,
  handleRightPanelUpdate,
  handlePhaseChange,
  handleStageStart,
  handleStageComplete,
  handlePositioningQuestion,
  handleSectionDraft,
  handleSectionApproved,
  handlePipelineComplete,
  handlePipelineError,
  handleError,
  handleHeartbeat,
  handleSystemMessage,
  handleSectionError,
  handleQualityScores,
  createSSEEventRouter,
} from '@/hooks/useSSEEventHandlers';

// ─── Mock notifications (no DOM in node env) ─────────────────────────────────

vi.mock('@/lib/notifications', () => ({
  requestNotificationPermission: vi.fn(),
  sendGateNotification: vi.fn(),
}));

// ─── Factory: minimal PipelineStateManager mock ───────────────────────────────

function makeMockState(overrides?: Partial<PipelineStateManager>): PipelineStateManager {
  let messageCounter = 0;

  const base: PipelineStateManager = {
    // Connection
    connected: false,
    setConnected: vi.fn(),
    error: null,
    setError: vi.fn(),

    // Processing
    isProcessing: false,
    setIsProcessing: vi.fn(),
    sessionComplete: false,
    setSessionComplete: vi.fn(),
    currentPhase: 'onboarding',
    setCurrentPhase: vi.fn(),
    pipelineStage: null,
    setPipelineStage: vi.fn(),
    isPipelineGateActive: false,
    setIsPipelineGateActive: vi.fn(),
    stalledSuspected: false,
    setStalledSuspected: vi.fn(),
    lastBackendActivityAt: null,
    setLastBackendActivityAt: vi.fn(),
    pipelineActivityMeta: {
      processing_state: 'idle',
      stage: null,
      stage_started_at: null,
      last_progress_at: null,
      last_heartbeat_at: null,
      last_backend_activity_at: null,
      last_stage_duration_ms: null,
      current_activity_message: null,
      current_activity_source: null,
      expected_next_action: null,
    },
    setPipelineActivityMeta: vi.fn(),

    // Messages
    messages: [],
    setMessages: vi.fn(),
    streamingText: '',
    setStreamingText: vi.fn(),
    tools: [],
    setTools: vi.fn(),

    // Gates
    askPrompt: null,
    setAskPrompt: vi.fn(),
    phaseGate: null,
    setPhaseGate: vi.fn(),

    // Panel
    panelType: null,
    setPanelType: vi.fn(),
    panelData: null,
    setPanelData: vi.fn(),

    // Resume / sections
    resume: null,
    setResume: vi.fn(),
    sectionDraft: null,
    setSectionDraft: vi.fn(),
    approvedSections: {},
    setApprovedSections: vi.fn(),

    // Pipeline-specific
    positioningQuestion: null,
    setPositioningQuestion: vi.fn(),
    positioningProfileFound: null,
    setPositioningProfileFound: vi.fn(),
    blueprintReady: null,
    setBlueprintReady: vi.fn(),
    qualityScores: null,
    setQualityScores: vi.fn(),
    draftReadiness: null,
    setDraftReadiness: vi.fn(),
    workflowReplan: null,
    setWorkflowReplan: vi.fn(),

    // Refs
    qualityScoresRef: { current: null },
    accessTokenRef: { current: null },
    abortControllerRef: { current: null },
    sectionsMapRef: { current: {} },
    sectionContextRef: { current: null },
    dismissedSuggestionIdsRef: { current: new Set<string>() },
    messageIdRef: { current: 0 },
    lastTextCompleteRef: { current: '' },
    lastSeqRef: { current: 0 },
    reconnectAttemptsRef: { current: 0 },
    reconnectTimerRef: { current: null },
    deltaBufferRef: { current: '' },
    rafIdRef: { current: null },
    mountedRef: { current: true },
    toolCleanupTimersRef: { current: new Set() },
    lastProgressTimestampRef: { current: Date.now() },
    staleNoticeActiveRef: { current: false },
    isProcessingRef: { current: false },
    staleCheckIntervalRef: { current: null },
    stalePipelineNoticeRef: { current: false },
    connectSSERef: { current: null },

    // Helpers
    nextId: vi.fn(() => `msg-${++messageCounter}`),
    patchPipelineActivityMeta: vi.fn(),
    resetState: vi.fn(),

    ...overrides,
  };

  return base;
}

function makeMarkProgress(): MarkPipelineProgressFn {
  return vi.fn();
}

// ─── handleConnected ─────────────────────────────────────────────────────────

describe('handleConnected', () => {
  it('sets connected to true and clears error', () => {
    const state = makeMockState();
    handleConnected(state);
    expect(state.setConnected).toHaveBeenCalledWith(true);
    expect(state.setError).toHaveBeenCalledWith(null);
  });

  it('resets reconnect attempts to zero', () => {
    const state = makeMockState();
    state.reconnectAttemptsRef.current = 5;
    handleConnected(state);
    expect(state.reconnectAttemptsRef.current).toBe(0);
  });

  it('patches pipeline activity meta with connected state', () => {
    const state = makeMockState();
    handleConnected(state);
    expect(state.patchPipelineActivityMeta).toHaveBeenCalledWith(
      expect.objectContaining({ current_activity_source: 'system' }),
    );
  });
});

// ─── handleSessionRestore ─────────────────────────────────────────────────────

describe('handleSessionRestore', () => {
  it('restores pipeline stage when present', () => {
    const state = makeMockState();
    handleSessionRestore(
      { pipeline_stage: 'gap_analysis', pipeline_status: 'idle' },
      state,
    );
    expect(state.setPipelineStage).toHaveBeenCalledWith('gap_analysis');
    expect(state.setCurrentPhase).toHaveBeenCalledWith('gap_analysis');
  });

  it('falls back to current_phase when pipeline_stage is absent', () => {
    const state = makeMockState();
    handleSessionRestore({ current_phase: 'research', pipeline_status: 'idle' }, state);
    expect(state.setCurrentPhase).toHaveBeenCalledWith('research');
  });

  it('restores messages from data', () => {
    const state = makeMockState();
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];
    handleSessionRestore({ messages, pipeline_status: 'idle' }, state);
    expect(state.setMessages).toHaveBeenCalled();
    const callArg = vi.mocked(state.setMessages).mock.calls[0][0] as unknown[];
    expect(callArg).toHaveLength(2);
  });

  it('sets isPipelineGateActive true when pipeline running with pending gate', () => {
    const state = makeMockState();
    handleSessionRestore(
      { pipeline_status: 'running', pending_gate: 'architect_review' },
      state,
    );
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(true);
  });

  it('sets isProcessing false when gate is pending', () => {
    const state = makeMockState();
    handleSessionRestore(
      { pipeline_status: 'running', pending_gate: 'architect_review' },
      state,
    );
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });

  it('clears askPrompt on restore', () => {
    const state = makeMockState();
    handleSessionRestore({ pipeline_status: 'idle' }, state);
    expect(state.setAskPrompt).toHaveBeenCalledWith(null);
  });
});

// ─── handleTextDelta ─────────────────────────────────────────────────────────

describe('handleTextDelta', () => {
  it('appends content to deltaBufferRef', () => {
    const state = makeMockState();
    state.deltaBufferRef.current = 'Hello';
    const flushDeltaBuffer = vi.fn();
    handleTextDelta({ content: ' world' }, state, flushDeltaBuffer);
    expect(state.deltaBufferRef.current).toBe('Hello world');
  });

  it('schedules a rAF when rafIdRef is null', () => {
    const state = makeMockState();
    state.rafIdRef.current = null;
    const flushDeltaBuffer = vi.fn();
    // The polyfill in beforeAll ensures requestAnimationFrame is available.
    // After calling handleTextDelta, rafIdRef should be set to a non-null value
    // because the handler schedules a rAF to flush the delta buffer.
    handleTextDelta({ content: 'test' }, state, flushDeltaBuffer);
    expect(state.rafIdRef.current).not.toBeNull();
  });
});

// ─── handleTextComplete ───────────────────────────────────────────────────────

describe('handleTextComplete', () => {
  it('appends an assistant message to setMessages', () => {
    const state = makeMockState();
    handleTextComplete({ content: 'Final answer.' }, state);
    expect(state.setMessages).toHaveBeenCalled();
  });

  it('deduplicates by sequence number — ignores lower seq', () => {
    const state = makeMockState();
    state.lastSeqRef.current = 10;
    handleTextComplete({ content: 'Old message', seq: 5 }, state);
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('deduplicates by content equality when seq is absent', () => {
    const state = makeMockState();
    state.lastTextCompleteRef.current = 'Duplicate content';
    handleTextComplete({ content: 'Duplicate content' }, state);
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('clears streamingText after completion', () => {
    const state = makeMockState();
    handleTextComplete({ content: 'Final text', seq: 1 }, state);
    expect(state.setStreamingText).toHaveBeenCalledWith('');
  });

  it('sets isProcessing to false after completion', () => {
    const state = makeMockState();
    handleTextComplete({ content: 'Done.', seq: 1 }, state);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });
});

// ─── handleToolStart ─────────────────────────────────────────────────────────

describe('handleToolStart', () => {
  it('adds a running tool to the tools list', () => {
    const state = makeMockState();
    handleToolStart({ tool_name: 'analyze_jd', description: 'Analyzes JD' }, state);
    expect(state.setTools).toHaveBeenCalled();
    const updater = vi.mocked(state.setTools).mock.calls[0][0] as (prev: unknown[]) => unknown[];
    const result = updater([]);
    expect(result).toEqual([
      { name: 'analyze_jd', description: 'Analyzes JD', status: 'running' },
    ]);
  });

  it('caps tool list at MAX_TOOL_STATUS_ENTRIES (20)', () => {
    const state = makeMockState();
    handleToolStart({ tool_name: 'tool_21' }, state);
    const updater = vi.mocked(state.setTools).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const existing = Array.from({ length: 20 }, (_, i) => ({
      name: `tool_${i}`,
      status: 'running',
    }));
    const result = updater(existing) as unknown[];
    expect(result.length).toBe(20);
  });
});

// ─── handleToolComplete ───────────────────────────────────────────────────────

describe('handleToolComplete', () => {
  it('marks a running tool as complete', () => {
    const state = makeMockState();
    handleToolComplete({ tool_name: 'analyze_jd', summary: 'Done' }, state);
    const updater = vi.mocked(state.setTools).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const existing = [{ name: 'analyze_jd', status: 'running' }];
    const result = updater(existing) as Array<{ name: string; status: string; summary?: string }>;
    expect(result[0].status).toBe('complete');
    expect(result[0].summary).toBe('Done');
  });
});

// ─── handleAskUser ───────────────────────────────────────────────────────────

describe('handleAskUser', () => {
  it('sets askPrompt with correct fields', () => {
    const state = makeMockState();
    handleAskUser(
      {
        tool_call_id: 'tc_1',
        question: 'How many engineers?',
        context: 'Team size',
        input_type: 'text',
        choices: null,
        skip_allowed: true,
      },
      state,
    );
    expect(state.setAskPrompt).toHaveBeenCalledWith({
      toolCallId: 'tc_1',
      question: 'How many engineers?',
      context: 'Team size',
      inputType: 'text',
      choices: null,
      skipAllowed: true,
    });
  });

  it('sets isProcessing to false', () => {
    const state = makeMockState();
    handleAskUser({ tool_call_id: 'tc_1', question: 'q?' }, state);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });

  it('patches pipeline activity meta to waiting_for_input', () => {
    const state = makeMockState();
    handleAskUser({ tool_call_id: 'tc_1', question: 'q?' }, state);
    expect(state.patchPipelineActivityMeta).toHaveBeenCalledWith(
      expect.objectContaining({ processing_state: 'waiting_for_input' }),
    );
  });
});

// ─── handlePhaseGate ─────────────────────────────────────────────────────────

describe('handlePhaseGate', () => {
  it('sets phaseGate with correct fields', () => {
    const state = makeMockState();
    handlePhaseGate(
      {
        tool_call_id: 'tc_gate',
        current_phase: 'intake',
        next_phase: 'research',
        phase_summary: 'Intake done',
        next_phase_preview: 'Starting research',
      },
      state,
    );
    expect(state.setPhaseGate).toHaveBeenCalledWith({
      toolCallId: 'tc_gate',
      currentPhase: 'intake',
      nextPhase: 'research',
      phaseSummary: 'Intake done',
      nextPhasePreview: 'Starting research',
    });
  });

  it('sets isProcessing to false', () => {
    const state = makeMockState();
    handlePhaseGate({ tool_call_id: 'tc', current_phase: 'intake', next_phase: 'research' }, state);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });
});

// ─── handleRightPanelUpdate ───────────────────────────────────────────────────

describe('handleRightPanelUpdate', () => {
  it('sets panel type and calls setPanelData with merged data', () => {
    const state = makeMockState();
    handleRightPanelUpdate(
      { panel_type: 'research_dashboard', data: { company: 'Acme' } },
      state,
    );
    expect(state.setPanelType).toHaveBeenCalledWith('research_dashboard');
    expect(state.setPanelData).toHaveBeenCalled();
  });

  it('merges onboarding_summary panels instead of replacing', () => {
    const existingPanel = { type: 'onboarding_summary', stat_a: 'old_value' };
    const state = makeMockState({ panelData: existingPanel as unknown as PipelineStateManager['panelData'] });
    handleRightPanelUpdate(
      { panel_type: 'onboarding_summary', data: { stat_b: 'new_value' } },
      state,
    );
    const updater = vi.mocked(state.setPanelData).mock.calls[0][0] as (
      prev: unknown
    ) => unknown;
    const merged = updater(existingPanel) as Record<string, unknown>;
    // Both old and new fields should be present
    expect(merged.stat_a).toBe('old_value');
    expect(merged.stat_b).toBe('new_value');
  });

  it('accumulates live_resume changes for the same section', () => {
    const state = makeMockState();
    const existingPanel = {
      type: 'live_resume',
      active_section: 'summary',
      changes: [{ original: 'old bullet' }],
    };
    handleRightPanelUpdate(
      {
        panel_type: 'live_resume',
        data: { active_section: 'summary', changes: [{ original: 'new bullet' }] },
      },
      state,
    );
    const updater = vi.mocked(state.setPanelData).mock.calls[0][0] as (
      prev: unknown
    ) => unknown;
    const merged = updater(existingPanel) as { changes: unknown[] };
    expect(merged.changes).toHaveLength(2);
  });
});

// ─── handlePhaseChange ────────────────────────────────────────────────────────

describe('handlePhaseChange', () => {
  it('sets current phase and clears gate + prompt', () => {
    const state = makeMockState();
    handlePhaseChange({ to_phase: 'research' }, state);
    expect(state.setCurrentPhase).toHaveBeenCalledWith('research');
    expect(state.setPhaseGate).toHaveBeenCalledWith(null);
    expect(state.setAskPrompt).toHaveBeenCalledWith(null);
  });

  it('clears active tools on phase change', () => {
    const state = makeMockState();
    handlePhaseChange({ to_phase: 'research' }, state);
    expect(state.setTools).toHaveBeenCalledWith([]);
  });

  it('patches activity meta to complete when to_phase is complete', () => {
    const state = makeMockState();
    handlePhaseChange({ to_phase: 'complete' }, state);
    expect(state.patchPipelineActivityMeta).toHaveBeenCalledWith(
      expect.objectContaining({ processing_state: 'complete' }),
    );
  });
});

// ─── handleStageStart ────────────────────────────────────────────────────────

describe('handleStageStart', () => {
  it('sets pipeline stage and current phase', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageStart({ stage: 'gap_analysis', message: 'Starting gap analysis' }, state, mark);
    expect(state.setPipelineStage).toHaveBeenCalledWith('gap_analysis');
    expect(state.setCurrentPhase).toHaveBeenCalledWith('gap_analysis');
  });

  it('sets isProcessing to true', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageStart({ stage: 'research', message: 'Researching...' }, state, mark);
    expect(state.setIsProcessing).toHaveBeenCalledWith(true);
  });

  it('clears gate active flag on stage start', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageStart({ stage: 'intake', message: 'Starting intake' }, state, mark);
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(false);
  });

  it('appends a system message for the stage', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageStart({ stage: 'research', message: 'Starting research' }, state, mark);
    expect(state.setMessages).toHaveBeenCalled();
  });

  it('calls markPipelineProgress with stage_start', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageStart({ stage: 'architect', message: 'Building blueprint' }, state, mark);
    expect(mark).toHaveBeenCalledWith(
      'Building blueprint',
      'stage_start',
      expect.objectContaining({ stage: 'architect' }),
    );
  });
});

// ─── handleStageComplete ──────────────────────────────────────────────────────

describe('handleStageComplete', () => {
  it('sets isProcessing to false', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageComplete({ stage: 'research', duration_ms: 5000 }, state, mark);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });

  it('updates pipeline stage', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageComplete({ stage: 'intake', duration_ms: 3000 }, state, mark);
    expect(state.setPipelineStage).toHaveBeenCalledWith('intake');
  });

  it('updates last_stage_duration_ms in activity meta', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleStageComplete({ stage: 'gap_analysis', duration_ms: 12000 }, state, mark);
    expect(state.setPipelineActivityMeta).toHaveBeenCalled();
    const updater = vi.mocked(state.setPipelineActivityMeta).mock.calls[0][0] as (
      prev: unknown
    ) => unknown;
    const updated = updater(state.pipelineActivityMeta) as { last_stage_duration_ms: number };
    expect(updated.last_stage_duration_ms).toBe(12000);
  });
});

// ─── handlePositioningQuestion ───────────────────────────────────────────────

describe('handlePositioningQuestion', () => {
  it('sets positioning question and panel type', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const q = {
      id: 'q_1',
      question_number: 1,
      question_text: 'What is your greatest achievement?',
      context: 'Career narrative',
      input_type: 'text',
    };
    handlePositioningQuestion({ question: q, questions_total: 8 }, state, mark);
    expect(state.setPositioningQuestion).toHaveBeenCalledWith(q);
    expect(state.setPanelType).toHaveBeenCalledWith('positioning_interview');
  });

  it('sets isPipelineGateActive to true', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const q = {
      id: 'q_1',
      question_number: 1,
      question_text: 'Q?',
      context: '',
      input_type: 'text',
    };
    handlePositioningQuestion({ question: q, questions_total: 5 }, state, mark);
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(true);
  });

  it('sets isProcessing to false', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const q = { id: 'q_1', question_number: 1, question_text: 'Q?', context: '', input_type: 'text' };
    handlePositioningQuestion({ question: q }, state, mark);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });
});

// ─── handleSectionDraft ───────────────────────────────────────────────────────

describe('handleSectionDraft', () => {
  it('sets section draft with section and content', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleSectionDraft(
      { section: 'summary', content: 'Experienced leader...' },
      state,
      mark,
    );
    expect(state.setSectionDraft).toHaveBeenCalledWith({
      section: 'summary',
      content: 'Experienced leader...',
    });
  });

  it('stores section content in sectionsMapRef', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleSectionDraft(
      { section: 'experience', content: 'VP of Engineering...' },
      state,
      mark,
    );
    expect(state.sectionsMapRef.current['experience']).toBe('VP of Engineering...');
  });

  it('sets panel type to section_review', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleSectionDraft({ section: 'skills', content: 'TypeScript, Python' }, state, mark);
    expect(state.setPanelType).toHaveBeenCalledWith('section_review');
  });

  it('sets isPipelineGateActive to true', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleSectionDraft({ section: 'summary', content: 'Text' }, state, mark);
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(true);
  });

  it('includes context in panel data when section context matches', () => {
    const mockContext = {
      context_version: 1,
      generated_at: new Date().toISOString(),
      blueprint_slice: {},
      evidence: [],
      keywords: [],
      gap_mappings: [],
      section_order: [],
      sections_approved: [],
      review_strategy: 'per_section' as const,
      review_required_sections: [],
      auto_approved_sections: [],
    };
    const state = makeMockState({
      sectionContextRef: { current: { section: 'summary', context: mockContext } },
    });
    const mark = makeMarkProgress();
    handleSectionDraft({ section: 'summary', content: 'Draft text' }, state, mark);
    expect(state.setPanelData).toHaveBeenCalled();
    const callArg = vi.mocked(state.setPanelData).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(callArg).toHaveProperty('context', mockContext);
  });
});

// ─── handleSectionApproved ────────────────────────────────────────────────────

describe('handleSectionApproved', () => {
  it('moves section from sectionsMap to approvedSections', () => {
    const state = makeMockState({
      sectionsMapRef: { current: { experience: 'VP of Engineering...' } },
    });
    handleSectionApproved({ section: 'experience' }, state);
    expect(state.setApprovedSections).toHaveBeenCalled();
    const updater = vi.mocked(state.setApprovedSections).mock.calls[0][0] as (
      prev: Record<string, string>
    ) => Record<string, string>;
    const result = updater({});
    expect(result['experience']).toBe('VP of Engineering...');
  });

  it('does not update approvedSections when section is not in map', () => {
    const state = makeMockState();
    handleSectionApproved({ section: 'nonexistent' }, state);
    expect(state.setApprovedSections).not.toHaveBeenCalled();
  });
});

// ─── handlePipelineComplete ────────────────────────────────────────────────────

describe('handlePipelineComplete', () => {
  it('sets sessionComplete to true', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineComplete(null, state, mark);
    expect(state.setSessionComplete).toHaveBeenCalledWith(true);
  });

  it('sets pipeline stage to complete', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineComplete(null, state, mark);
    expect(state.setPipelineStage).toHaveBeenCalledWith('complete');
  });

  it('sets panel type to completion', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineComplete(null, state, mark);
    expect(state.setPanelType).toHaveBeenCalledWith('completion');
  });

  it('sets resume from data.resume when provided', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const resume = {
      summary: 'Senior leader',
      experience: [],
      skills: {},
      education: [],
      certifications: [],
      ats_score: 87,
    };
    handlePipelineComplete({ resume }, state, mark);
    expect(state.setResume).toHaveBeenCalledWith(resume);
  });

  it('builds resume from sectionsMapRef when data.resume is absent', () => {
    const state = makeMockState({
      sectionsMapRef: { current: { summary: 'Experienced leader' } },
    });
    const mark = makeMarkProgress();
    handlePipelineComplete({}, state, mark);
    expect(state.setResume).toHaveBeenCalled();
    const callArg = vi.mocked(state.setResume).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(callArg['summary']).toBe('Experienced leader');
  });

  it('clears isPipelineGateActive', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineComplete(null, state, mark);
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(false);
  });
});

// ─── handlePipelineError ──────────────────────────────────────────────────────

describe('handlePipelineError', () => {
  it('sets error from data.error', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineError({ error: 'LLM timeout' }, state, mark);
    expect(state.setError).toHaveBeenCalledWith('LLM timeout');
  });

  it('uses default error message when data is null', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineError(null, state, mark);
    expect(state.setError).toHaveBeenCalledWith('Pipeline error');
  });

  it('sets isProcessing to false', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineError({ error: 'timeout' }, state, mark);
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });

  it('clears isPipelineGateActive', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handlePipelineError({ error: 'timeout' }, state, mark);
    expect(state.setIsPipelineGateActive).toHaveBeenCalledWith(false);
  });
});

// ─── handleError ─────────────────────────────────────────────────────────────

describe('handleError', () => {
  it('sets error from data.message', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleError({ message: 'Something broke' }, state, mark);
    expect(state.setError).toHaveBeenCalledWith('Something broke');
  });

  it('replaces JSON-looking error messages with generic text', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleError({ message: '{"code":500}' }, state, mark);
    const errorArg = vi.mocked(state.setError).mock.calls[0][0] as string;
    expect(errorArg).not.toContain('{');
  });

  it('handles null data gracefully', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    handleError(null, state, mark);
    expect(state.setError).toHaveBeenCalled();
  });
});

// ─── handleHeartbeat ─────────────────────────────────────────────────────────

describe('handleHeartbeat', () => {
  it('updates pipeline activity meta when processing', () => {
    const state = makeMockState({
      isProcessingRef: { current: true },
    });
    handleHeartbeat(state);
    expect(state.setPipelineActivityMeta).toHaveBeenCalled();
  });

  it('does not call setPipelineActivityMeta when not processing', () => {
    const state = makeMockState({
      isProcessingRef: { current: false },
    });
    handleHeartbeat(state);
    expect(state.setPipelineActivityMeta).not.toHaveBeenCalled();
  });
});

// ─── handleSystemMessage ─────────────────────────────────────────────────────

describe('handleSystemMessage', () => {
  it('appends a system message to messages', () => {
    const state = makeMockState();
    handleSystemMessage({ content: 'Pipeline resumed.' }, state);
    expect(state.setMessages).toHaveBeenCalled();
    const updater = vi.mocked(state.setMessages).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const result = updater([]) as Array<{ role: string; content: string }>;
    expect(result[0].role).toBe('system');
    expect(result[0].content).toBe('Pipeline resumed.');
  });

  it('ignores empty or whitespace-only content', () => {
    const state = makeMockState();
    handleSystemMessage({ content: '   ' }, state);
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('ignores missing content field', () => {
    const state = makeMockState();
    handleSystemMessage({}, state);
    expect(state.setMessages).not.toHaveBeenCalled();
  });
});

// ─── handleSectionError ───────────────────────────────────────────────────────

describe('handleSectionError', () => {
  it('appends a system message describing the section error', () => {
    const state = makeMockState();
    handleSectionError({ section: 'experience', error: 'LLM timeout' }, state);
    expect(state.setMessages).toHaveBeenCalled();
    const updater = vi.mocked(state.setMessages).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const result = updater([]) as Array<{ role: string; content: string }>;
    expect(result[0].content).toContain('experience');
    expect(result[0].content).toContain('LLM timeout');
  });

  it('uses fallback text when section and error are undefined', () => {
    const state = makeMockState();
    handleSectionError({}, state);
    expect(state.setMessages).toHaveBeenCalled();
    const updater = vi.mocked(state.setMessages).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const result = updater([]) as Array<{ content: string }>;
    expect(result[0].content).toContain('section');
  });
});

// ─── handleQualityScores ──────────────────────────────────────────────────────

describe('handleQualityScores', () => {
  it('calls setQualityScores with the provided scores', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const scores = {
      ats_score: 88,
      authenticity: 91,
      evidence_integrity: 85,
      blueprint_compliance: 90,
      hiring_manager_impact: 4,
      requirement_coverage: 87,
    };
    handleQualityScores({ scores, details: {} }, state, mark);
    expect(state.setQualityScores).toHaveBeenCalledWith(scores);
    expect(state.qualityScoresRef.current).toEqual(scores);
  });

  it('sets panel type to quality_dashboard', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const scores = {
      ats_score: 88,
      authenticity: 91,
      evidence_integrity: 85,
      blueprint_compliance: 90,
      hiring_manager_impact: 4,
      requirement_coverage: 87,
    };
    handleQualityScores({ scores, details: {} }, state, mark);
    expect(state.setPanelType).toHaveBeenCalledWith('quality_dashboard');
  });
});

// ─── createSSEEventRouter ────────────────────────────────────────────────────

describe('createSSEEventRouter', () => {
  it('routes stage_start event to handleStageStart', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const flush = vi.fn();
    const abort = vi.fn();
    const router = createSSEEventRouter(state, mark, flush, abort);

    router('stage_start', JSON.stringify({ stage: 'research', message: 'Starting research' }));
    expect(state.setPipelineStage).toHaveBeenCalledWith('research');
  });

  it('routes stage_complete event to handleStageComplete', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router('stage_complete', JSON.stringify({ stage: 'intake', duration_ms: 5000 }));
    expect(state.setIsProcessing).toHaveBeenCalledWith(false);
  });

  it('routes pipeline_complete event to handlePipelineComplete', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router('pipeline_complete', JSON.stringify({}));
    expect(state.setSessionComplete).toHaveBeenCalledWith(true);
  });

  it('routes pipeline_error event to handlePipelineError', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router('pipeline_error', JSON.stringify({ error: 'LLM failure', stage: 'research' }));
    expect(state.setError).toHaveBeenCalledWith('LLM failure');
  });

  it('routes section_draft event to handleSectionDraft', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router('section_draft', JSON.stringify({ section: 'summary', content: 'Leader with...' }));
    expect(state.setSectionDraft).toHaveBeenCalled();
  });

  it('routes right_panel_update event to handleRightPanelUpdate', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router(
      'right_panel_update',
      JSON.stringify({ panel_type: 'research_dashboard', data: {} }),
    );
    expect(state.setPanelType).toHaveBeenCalledWith('research_dashboard');
  });

  it('routes connected event (no raw data needed)', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    router('connected', '');
    expect(state.setConnected).toHaveBeenCalledWith(true);
  });

  it('silently ignores section_status event', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    // Should not throw
    expect(() => router('section_status', JSON.stringify({ section: 'summary' }))).not.toThrow();
  });

  it('handles malformed JSON gracefully (no crash)', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    // Should not throw even with invalid JSON
    expect(() => router('stage_start', '{invalid json')).not.toThrow();
  });

  it('handles unknown event type without crashing', () => {
    const state = makeMockState();
    const mark = makeMarkProgress();
    const router = createSSEEventRouter(state, mark, vi.fn(), vi.fn());

    expect(() => router('unknown_future_event', '{}')).not.toThrow();
  });
});
