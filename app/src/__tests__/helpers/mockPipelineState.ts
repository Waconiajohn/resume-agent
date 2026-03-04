/**
 * Shared test helper: makeMockState
 *
 * Produces a minimal PipelineStateManager mock with every field stubbed to a
 * safe default. All setter/helper fields are `vi.fn()` so tests can assert
 * calls without wiring up React state.
 *
 * Usage:
 *   import { makeMockState } from '@/__tests__/helpers/mockPipelineState';
 *   const state = makeMockState();                   // all defaults
 *   const state = makeMockState({ messages: [...] }); // selective override
 */

import { vi } from 'vitest';
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';

export function makeMockState(overrides?: Partial<PipelineStateManager>): PipelineStateManager {
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

    // Live document section tracking
    sectionDraftsRef: { current: {} },
    sectionDraftsVersion: 0,
    sectionDraftsSnapshot: {},
    sectionBuildOrder: [],
    setSectionBuildOrder: vi.fn(),
    setSectionDraftEntry: vi.fn(),

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

    // Activity feed
    activityMessages: [],
    setActivityMessages: vi.fn(),

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
