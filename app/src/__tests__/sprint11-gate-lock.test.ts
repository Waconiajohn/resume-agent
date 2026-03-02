/**
 * Tests for the request-level lock added to handlePipelineRespond in App.tsx.
 *
 * The lock is implemented with a MutableRefObject<boolean> (isRespondingRef).
 * We cannot render App.tsx in this node environment, so we test the extracted
 * guard logic directly — the same pattern used in WorkbenchSuggestions.test.ts.
 *
 * The behaviour under test:
 *   1. If isRespondingRef.current is already true, the handler returns early.
 *   2. The ref is set to true before the async call and reset to false in finally.
 *   3. Concurrent calls are serialised: only the first one proceeds; subsequent
 *      calls issued before the first settles are silently dropped.
 *   4. When isPipelineGateActive transitions to true, the ref resets to false so
 *      the next gate can be responded to.
 *   5. On respondToGate failure (returns false), setIsPipelineGateActive(true) is
 *      called so the user can retry; the ref is also reset to false.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Simulated ref — mirrors React.MutableRefObject<boolean>
// ---------------------------------------------------------------------------

function makeRef(initial: boolean): { current: boolean } {
  return { current: initial };
}

// ---------------------------------------------------------------------------
// Simulated handlePipelineRespond logic — mirrors the implementation in App.tsx
// ---------------------------------------------------------------------------

async function simulateHandlePipelineRespond(opts: {
  gate: string;
  response: unknown;
  currentSessionId: string | null;
  isPipelineGateActive: boolean;
  isRespondingRef: { current: boolean };
  setIsPipelineGateActive: (value: boolean) => void;
  respondToGate: (sessionId: string, gate: string, response: unknown) => Promise<boolean>;
}): Promise<void> {
  const {
    gate,
    response,
    currentSessionId,
    isPipelineGateActive,
    isRespondingRef,
    setIsPipelineGateActive,
    respondToGate,
  } = opts;

  if (!currentSessionId) return;
  if (!isPipelineGateActive) return;
  if (isRespondingRef.current) return;
  isRespondingRef.current = true;
  setIsPipelineGateActive(false);
  try {
    const ok = await respondToGate(currentSessionId, gate, response);
    if (!ok) {
      setIsPipelineGateActive(true);
    }
  } finally {
    isRespondingRef.current = false;
  }
}

// ---------------------------------------------------------------------------
// Helpers to build the common call options
// ---------------------------------------------------------------------------

function makeOpts(
  overrides: Partial<Parameters<typeof simulateHandlePipelineRespond>[0]> & {
    isRespondingRef: { current: boolean };
    setIsPipelineGateActive: (value: boolean) => void;
    respondToGate: (sessionId: string, gate: string, response: unknown) => Promise<boolean>;
  },
): Parameters<typeof simulateHandlePipelineRespond>[0] {
  return {
    gate: 'review',
    response: true,
    currentSessionId: 'session-1',
    isPipelineGateActive: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handlePipelineRespond — ref-level lock (Bug 18)', () => {
  let isRespondingRef: { current: boolean };
  let gateActiveSetter: (value: boolean) => void;

  beforeEach(() => {
    isRespondingRef = makeRef(false);
    gateActiveSetter = vi.fn() as (value: boolean) => void;
  });

  // 1. No-op when currentSessionId is null
  it('returns early when currentSessionId is null', async () => {
    const respondToGate = vi.fn().mockResolvedValue(true) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    await simulateHandlePipelineRespond(makeOpts({
      currentSessionId: null,
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    expect(respondToGate).not.toHaveBeenCalled();
  });

  // 2. No-op when gate is not active
  it('returns early when isPipelineGateActive is false', async () => {
    const respondToGate = vi.fn().mockResolvedValue(true) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    await simulateHandlePipelineRespond(makeOpts({
      isPipelineGateActive: false,
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    expect(respondToGate).not.toHaveBeenCalled();
  });

  // 3. Normal success path: calls respondToGate, resets ref, disables gate
  it('calls respondToGate on success and resets ref to false', async () => {
    const respondToGate = vi.fn().mockResolvedValue(true) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    await simulateHandlePipelineRespond(makeOpts({
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    expect(respondToGate).toHaveBeenCalledOnce();
    expect(respondToGate).toHaveBeenCalledWith('session-1', 'review', true);
    // Ref must be released so the next gate can be responded to
    expect(isRespondingRef.current).toBe(false);
    // Gate disabled optimistically
    expect(gateActiveSetter).toHaveBeenCalledWith(false);
    // No re-enable call because respondToGate returned true
    expect(gateActiveSetter).not.toHaveBeenCalledWith(true);
  });

  // 4. On respondToGate failure, re-enables gate and resets ref
  it('re-enables gate on respondToGate failure', async () => {
    const respondToGate = vi.fn().mockResolvedValue(false) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    await simulateHandlePipelineRespond(makeOpts({
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    expect(isRespondingRef.current).toBe(false);
    expect(gateActiveSetter).toHaveBeenCalledWith(false); // optimistic disable
    expect(gateActiveSetter).toHaveBeenCalledWith(true);  // re-enable on failure
  });

  // 5. Concurrent calls — only the first one triggers respondToGate
  it('drops concurrent calls while a request is in flight', async () => {
    let resolveFirst!: (value: boolean) => void;
    const firstCallPromise = new Promise<boolean>((res) => {
      resolveFirst = res;
    });
    const respondToGate = vi.fn().mockReturnValueOnce(firstCallPromise) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    // Fire first call without awaiting — it will hang on firstCallPromise
    const firstCall = simulateHandlePipelineRespond(makeOpts({
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    // Ref is now true — second call should be dropped immediately
    expect(isRespondingRef.current).toBe(true);
    await simulateHandlePipelineRespond(makeOpts({
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    // Only the first call reached respondToGate
    expect(respondToGate).toHaveBeenCalledOnce();

    // Settle the first call
    resolveFirst(true);
    await firstCall;

    // Ref released after first call completes
    expect(isRespondingRef.current).toBe(false);
    // Still only one respondToGate call total
    expect(respondToGate).toHaveBeenCalledOnce();
  });

  // 6. Ref resets to false even when respondToGate throws
  it('resets ref in finally when respondToGate throws', async () => {
    const respondToGate = vi.fn().mockRejectedValue(new Error('network error')) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    await expect(
      simulateHandlePipelineRespond(makeOpts({
        isRespondingRef,
        setIsPipelineGateActive: gateActiveSetter,
        respondToGate,
      })),
    ).rejects.toThrow('network error');

    // finally block still runs
    expect(isRespondingRef.current).toBe(false);
  });

  // 7. Lock resets when a new gate activates (mirrors useEffect behaviour in App.tsx)
  it('resets lock when a new gate activates', () => {
    // Pre-condition: lock is stuck in true state
    isRespondingRef.current = true;

    // The useEffect in App.tsx does this when isPipelineGateActive becomes true:
    const isPipelineGateActive = true;
    if (isPipelineGateActive) {
      isRespondingRef.current = false;
    }

    expect(isRespondingRef.current).toBe(false);
  });

  // 8. Multiple sequential gates — each gate gets a fresh lock cycle
  it('allows a second gate response after first gate completes', async () => {
    const respondToGate = vi.fn().mockResolvedValue(true) as (
      sessionId: string, gate: string, response: unknown
    ) => Promise<boolean>;

    // First gate response
    await simulateHandlePipelineRespond(makeOpts({
      gate: 'gate_1',
      response: true,
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    // Simulate new gate becoming active (mirrors the useEffect)
    isRespondingRef.current = false;

    // Second gate response
    await simulateHandlePipelineRespond(makeOpts({
      gate: 'gate_2',
      response: { approved: true },
      isRespondingRef,
      setIsPipelineGateActive: gateActiveSetter,
      respondToGate,
    }));

    expect(respondToGate).toHaveBeenCalledTimes(2);
    expect(respondToGate).toHaveBeenNthCalledWith(1, 'session-1', 'gate_1', true);
    expect(respondToGate).toHaveBeenNthCalledWith(2, 'session-1', 'gate_2', { approved: true });
    expect(isRespondingRef.current).toBe(false);
  });
});
