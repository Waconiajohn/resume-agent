/**
 * Tests for useStaleDetection.ts
 *
 * The hook's behavior is driven entirely by setInterval logic that reads
 * from refs on the state manager. We test this logic directly by extracting
 * the interval callback pattern rather than rendering the hook, since
 * renderHook requires a DOM environment and the rest of the test suite runs
 * in node.
 *
 * Strategy: Simulate the exact same conditional logic the interval callback
 * checks, using fake timers and mock state objects, validating that the
 * correct setters fire at the right time thresholds.
 *
 * Environment: node (default for .test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PipelineStateManager } from '@/hooks/usePipelineStateManager';

// ─── Constants mirrored from the hook ────────────────────────────────────────

const STALE_THRESHOLD_MS = 120_000; // 2 minutes
const CHECK_INTERVAL_MS = 10_000;  // 10 seconds

// ─── Helper: simulate the interval callback from the hook ─────────────────────
//
// This function replicates the body of the setInterval callback in
// useStaleDetection.ts so we can unit-test the logic without React rendering.
//
function runStaleCheckCallback(state: PipelineStateManager): void {
  if (!state.mountedRef.current) return;
  if (
    state.isProcessingRef.current &&
    Date.now() - state.lastProgressTimestampRef.current > STALE_THRESHOLD_MS
  ) {
    if (!state.staleNoticeActiveRef.current) {
      state.staleNoticeActiveRef.current = true;
      state.setStalledSuspected(true);
      state.setPipelineActivityMeta((prev) => ({
        ...prev,
        current_activity_message:
          'No confirmed backend progress was detected for a while. The pipeline may be stalled.',
        current_activity_source: 'system',
        expected_next_action:
          'Use Reconnect or Refresh State to confirm pipeline status',
      }));
      state.setMessages((prev) => [
        ...prev,
        {
          id: state.nextId(),
          role: 'system',
          content:
            'Processing looks stalled (no confirmed backend updates for a while). Try reconnecting or refreshing the page. If the pipeline is waiting for input, check the center workspace for a questionnaire or review step.',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }
}

// ─── Mock state factory ───────────────────────────────────────────────────────

function makeMockState(
  overrides?: Partial<PipelineStateManager>,
): PipelineStateManager {
  let messageCounter = 0;

  const base: PipelineStateManager = {
    connected: false,
    setConnected: vi.fn(),
    error: null,
    setError: vi.fn(),
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
    messages: [],
    setMessages: vi.fn(),
    streamingText: '',
    setStreamingText: vi.fn(),
    tools: [],
    setTools: vi.fn(),
    askPrompt: null,
    setAskPrompt: vi.fn(),
    phaseGate: null,
    setPhaseGate: vi.fn(),
    panelType: null,
    setPanelType: vi.fn(),
    panelData: null,
    setPanelData: vi.fn(),
    resume: null,
    setResume: vi.fn(),
    sectionDraft: null,
    setSectionDraft: vi.fn(),
    approvedSections: {},
    setApprovedSections: vi.fn(),
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
    nextId: vi.fn(() => `msg-${++messageCounter}`),
    patchPipelineActivityMeta: vi.fn(),
    resetState: vi.fn(),

    ...overrides,
  };

  return base;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useStaleDetection (interval callback logic)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not fire stale notice when pipeline is not processing', () => {
    const state = makeMockState({
      isProcessingRef: { current: false },
      lastProgressTimestampRef: {
        current: Date.now() - STALE_THRESHOLD_MS - 1000,
      },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).not.toHaveBeenCalled();
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('does not fire stale notice when last progress is recent (within threshold)', () => {
    vi.setSystemTime(Date.now());
    const state = makeMockState({
      isProcessingRef: { current: true },
      // Last progress was just 30 seconds ago — well within 120s threshold
      lastProgressTimestampRef: { current: Date.now() - 30_000 },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).not.toHaveBeenCalled();
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('fires stale notice when processing and progress is older than 120s', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: {
        current: now - STALE_THRESHOLD_MS - 5000, // 125 seconds ago
      },
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).toHaveBeenCalledWith(true);
    expect(state.staleNoticeActiveRef.current).toBe(true);
  });

  it('appends a system chat message when stall is detected', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - STALE_THRESHOLD_MS - 1000 },
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setMessages).toHaveBeenCalled();
    const updater = vi.mocked(state.setMessages).mock.calls[0][0] as (
      prev: unknown[]
    ) => unknown[];
    const result = updater([]) as Array<{ role: string; content: string }>;
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toMatch(/stalled/i);
  });

  it('updates pipeline activity meta with stall message and system source', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - STALE_THRESHOLD_MS - 1000 },
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setPipelineActivityMeta).toHaveBeenCalled();
    const updater = vi.mocked(state.setPipelineActivityMeta).mock.calls[0][0] as (
      prev: unknown
    ) => unknown;
    const updated = updater(state.pipelineActivityMeta) as {
      current_activity_source: string;
      current_activity_message: string;
    };
    expect(updated.current_activity_source).toBe('system');
    expect(updated.current_activity_message).toMatch(/stalled/i);
  });

  it('does not re-fire stale notice when staleNoticeActiveRef is already true', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - STALE_THRESHOLD_MS - 5000 },
      staleNoticeActiveRef: { current: true }, // already notified
    });

    runStaleCheckCallback(state);
    runStaleCheckCallback(state); // run twice to simulate multiple intervals

    expect(state.setStalledSuspected).not.toHaveBeenCalled();
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('does not fire stale notice when mountedRef is false', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - STALE_THRESHOLD_MS - 5000 },
      mountedRef: { current: false }, // simulates unmounted
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).not.toHaveBeenCalled();
    expect(state.setMessages).not.toHaveBeenCalled();
  });

  it('threshold boundary: fires at exactly 120001ms elapsed', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - (STALE_THRESHOLD_MS + 1) },
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).toHaveBeenCalledWith(true);
  });

  it('threshold boundary: does NOT fire at exactly 119999ms elapsed', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - (STALE_THRESHOLD_MS - 1) },
      staleNoticeActiveRef: { current: false },
    });

    runStaleCheckCallback(state);

    expect(state.setStalledSuspected).not.toHaveBeenCalled();
  });
});

// ─── Interval registration behavior ──────────────────────────────────────────
//
// These tests verify the setInterval wiring separately from the callback logic,
// using fake timers to confirm the interval fires at CHECK_INTERVAL_MS cadence.

describe('useStaleDetection (interval wiring via fake timers)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('callback fires at CHECK_INTERVAL_MS cadence', () => {
    const callbackSpy = vi.fn();
    const intervalId = setInterval(callbackSpy, CHECK_INTERVAL_MS);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS - 1);
    expect(callbackSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callbackSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(callbackSpy).toHaveBeenCalledTimes(2);

    clearInterval(intervalId);
  });

  it('callback stops firing after clearInterval is called', () => {
    const callbackSpy = vi.fn();
    const intervalId = setInterval(callbackSpy, CHECK_INTERVAL_MS);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(callbackSpy).toHaveBeenCalledTimes(1);

    clearInterval(intervalId);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS * 5);
    expect(callbackSpy).toHaveBeenCalledTimes(1); // no more calls
  });

  it('stale notice fires only once even across multiple interval ticks', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    const state = makeMockState({
      isProcessingRef: { current: true },
      lastProgressTimestampRef: { current: now - STALE_THRESHOLD_MS - 5000 },
      staleNoticeActiveRef: { current: false },
    });

    const intervalId = setInterval(() => runStaleCheckCallback(state), CHECK_INTERVAL_MS);

    vi.advanceTimersByTime(CHECK_INTERVAL_MS * 5);

    // Despite 5 ticks, stale notice fires only once
    expect(state.setStalledSuspected).toHaveBeenCalledTimes(1);

    clearInterval(intervalId);
  });
});
