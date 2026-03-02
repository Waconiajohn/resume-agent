/**
 * Product Coordinator — Unit tests for the generic pipeline runner.
 *
 * Uses mock ProductConfig with fake agents to verify:
 * - Sequential agent execution
 * - Gate pause/resume
 * - Inter-agent handler subscription/cleanup
 * - Usage tracking
 * - Error handling
 * - onComplete callbacks
 * - validateAfterAgent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies before any imports
vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: vi.fn(() => ({ input_tokens: 100, output_tokens: 200 })),
  stopUsageTracking: vi.fn(),
  setUsageTrackingContext: vi.fn(),
}));

vi.mock('../lib/logger.js', () => {
  const child = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  });
  return {
    default: { child, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    createSessionLogger: vi.fn(() => child()),
  };
});

vi.mock('../lib/llm.js', () => ({
  MODEL_PRICING: {
    'glm-4.7-flash': { input: 0, output: 0 },
    'glm-4.5-air': { input: 0.20, output: 1.10 },
    'glm-4.7': { input: 0.60, output: 2.20 },
  },
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

// Mock runAgentLoop
const mockRunAgentLoop = vi.fn();
vi.mock('../agents/runtime/agent-loop.js', () => ({
  runAgentLoop: (...args: unknown[]) => mockRunAgentLoop(...args),
}));

import { runProductPipeline } from '../agents/runtime/product-coordinator.js';
import type { ProductConfig, RuntimeParams, AgentPhase } from '../agents/runtime/product-config.js';
import type { AgentConfig, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';
import { startUsageTracking, stopUsageTracking } from '../lib/llm-provider.js';

// ─── Test types ──────────────────────────────────────────────────────

interface TestState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  agent_results: string[];
}

type TestEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string; duration_ms?: number }
  | { type: 'pipeline_error'; stage: string; error: string }
  | { type: 'transparency'; stage: string; message: string }
  | { type: 'done'; result: string };

function makeAgentConfig(name: string): AgentConfig<TestState, TestEvent> {
  return {
    identity: { name, domain: 'test' },
    system_prompt: `You are ${name}.`,
    tools: [],
    model: 'test-model',
    max_rounds: 5,
    round_timeout_ms: 10_000,
    overall_timeout_ms: 30_000,
  };
}

function makeProductConfig(
  phases: AgentPhase<TestState, TestEvent>[],
  overrides?: Partial<ProductConfig<TestState, TestEvent>>,
): ProductConfig<TestState, TestEvent> {
  return {
    domain: 'test',
    agents: phases,
    createInitialState: (sessionId, userId) => ({
      session_id: sessionId,
      user_id: userId,
      current_stage: 'start',
      agent_results: [],
    }),
    buildAgentMessage: (agentName) => `Start ${agentName}`,
    finalizeResult: (state, _input, emit) => {
      emit({ type: 'done', result: state.agent_results.join(',') });
      return { results: state.agent_results };
    },
    ...overrides,
  };
}

function makeParams(overrides?: Partial<RuntimeParams<TestEvent>>): RuntimeParams<TestEvent> {
  return {
    sessionId: 'test-session',
    userId: 'test-user',
    emit: vi.fn(),
    waitForUser: vi.fn(async () => true) as unknown as <T>(gate: string) => Promise<T>,
    input: { some: 'data' },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('runProductPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: runAgentLoop succeeds with empty scratchpad
    mockRunAgentLoop.mockResolvedValue({
      scratchpad: {},
      messages_out: [],
      usage: { input_tokens: 50, output_tokens: 100 },
      rounds_used: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs 2 agents to completion in order', async () => {
    const callOrder: string[] = [];

    mockRunAgentLoop.mockImplementation(async (params: Record<string, unknown>) => {
      const config = params.config as AgentConfig<TestState, TestEvent>;
      callOrder.push(config.identity.name);
      return {
        scratchpad: {},
        messages_out: [],
        usage: { input_tokens: 50, output_tokens: 100 },
        rounds_used: 2,
      };
    });

    const phases: AgentPhase<TestState, TestEvent>[] = [
      { name: 'agent-a', config: makeAgentConfig('agent-a') },
      { name: 'agent-b', config: makeAgentConfig('agent-b') },
    ];

    const config = makeProductConfig(phases);
    const params = makeParams();

    const result = await runProductPipeline(config, params);

    expect(callOrder).toEqual(['agent-a', 'agent-b']);
    expect(result.state.session_id).toBe('test-session');
    expect(startUsageTracking).toHaveBeenCalledWith('test-session', 'test-user');
    expect(stopUsageTracking).toHaveBeenCalledWith('test-session');
  });

  it('pauses at gates and resumes on response', async () => {
    let gateResolved = false;
    const waitForUser = vi.fn(async () => {
      gateResolved = true;
      return { approved: true, edits: { angle: 'new' } };
    }) as unknown as <T>(gate: string) => Promise<T>;

    const onResponse = vi.fn();

    const phases: AgentPhase<TestState, TestEvent>[] = [
      {
        name: 'agent-a',
        config: makeAgentConfig('agent-a'),
        gates: [{
          name: 'review_gate',
          onResponse,
        }],
      },
      { name: 'agent-b', config: makeAgentConfig('agent-b') },
    ];

    const config = makeProductConfig(phases);
    const params = makeParams({ waitForUser });

    await runProductPipeline(config, params);

    expect(gateResolved).toBe(true);
    expect(waitForUser).toHaveBeenCalledWith('review_gate');
    expect(onResponse).toHaveBeenCalledWith(
      { approved: true, edits: { angle: 'new' } },
      expect.objectContaining({ session_id: 'test-session' }),
    );
    // agent-b should still run after gate
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(2);
  });

  it('skips conditional gates when condition is false', async () => {
    const waitForUser = vi.fn(async () => true) as unknown as <T>(gate: string) => Promise<T>;

    const phases: AgentPhase<TestState, TestEvent>[] = [
      {
        name: 'agent-a',
        config: makeAgentConfig('agent-a'),
        gates: [{
          name: 'optional_gate',
          condition: () => false, // never fire
        }],
      },
    ];

    const config = makeProductConfig(phases);
    const params = makeParams({ waitForUser });

    await runProductPipeline(config, params);

    // waitForUser should NOT have been called for the gate
    expect(waitForUser).not.toHaveBeenCalled();
  });

  it('calls onComplete after each agent', async () => {
    mockRunAgentLoop.mockResolvedValue({
      scratchpad: { result_key: 'hello' },
      messages_out: [],
      usage: { input_tokens: 50, output_tokens: 100 },
      rounds_used: 1,
    });

    const onComplete = vi.fn((scratchpad, state: TestState) => {
      state.agent_results.push(scratchpad.result_key as string);
    });

    const phases: AgentPhase<TestState, TestEvent>[] = [
      { name: 'agent-a', config: makeAgentConfig('agent-a'), onComplete },
    ];

    const config = makeProductConfig(phases);
    const params = makeParams();

    const result = await runProductPipeline(config, params);

    expect(onComplete).toHaveBeenCalledWith(
      { result_key: 'hello' },
      expect.objectContaining({ session_id: 'test-session' }),
      expect.any(Function), // emit
    );
    expect(result.state.agent_results).toEqual(['hello']);
  });

  it('calls validateAfterAgent and throws on failure', async () => {
    const config = makeProductConfig(
      [{ name: 'agent-a', config: makeAgentConfig('agent-a') }],
      {
        validateAfterAgent: (agentName) => {
          if (agentName === 'agent-a') throw new Error('Missing intake data');
        },
        emitError: vi.fn(),
      },
    );

    const params = makeParams();

    await expect(runProductPipeline(config, params)).rejects.toThrow('Missing intake data');
  });

  it('calls persistResult after finalization', async () => {
    const persistResult = vi.fn(async () => {});

    const config = makeProductConfig(
      [{ name: 'agent-a', config: makeAgentConfig('agent-a') }],
      { persistResult },
    );

    const params = makeParams();

    await runProductPipeline(config, params);

    expect(persistResult).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 'test-session' }),
      expect.objectContaining({ results: [] }),
      expect.objectContaining({ some: 'data' }),
    );
  });

  it('emits stage_start and stage_complete when stageMessage is set', async () => {
    const emit = vi.fn();

    const phases: AgentPhase<TestState, TestEvent>[] = [
      {
        name: 'agent-a',
        config: makeAgentConfig('agent-a'),
        stageMessage: { startStage: 'agent-a', start: 'Starting A...', complete: 'A done' },
      },
    ];

    const config = makeProductConfig(phases);
    const params = makeParams({ emit });

    await runProductPipeline(config, params);

    const stageEvents = emit.mock.calls.map(c => c[0]);
    const startEvent = stageEvents.find((e: TestEvent) => e.type === 'stage_start');
    const completeEvent = stageEvents.find((e: TestEvent) => e.type === 'stage_complete');

    expect(startEvent).toEqual({ type: 'stage_start', stage: 'agent-a', message: 'Starting A...' });
    expect(completeEvent).toMatchObject({ type: 'stage_complete', stage: 'agent-a', message: 'A done' });
  });

  it('returns usage stats and stage timings', async () => {
    const config = makeProductConfig([
      { name: 'agent-a', config: makeAgentConfig('agent-a') },
    ]);

    const params = makeParams();
    const result = await runProductPipeline(config, params);

    expect(result.usage).toEqual({
      input_tokens: 100,
      output_tokens: 200,
      estimated_cost_usd: expect.any(Number),
    });
    expect(result.stage_timings).toHaveProperty('agent-a');
    expect(typeof result.stage_timings['agent-a']).toBe('number');
  });

  it('emits pipeline_error on agent failure', async () => {
    mockRunAgentLoop.mockRejectedValue(new Error('LLM timeout'));
    const emit = vi.fn();

    const config = makeProductConfig([
      { name: 'agent-a', config: makeAgentConfig('agent-a') },
    ]);

    const params = makeParams({ emit });

    await expect(runProductPipeline(config, params)).rejects.toThrow('LLM timeout');

    const errorEvents = emit.mock.calls.map(c => c[0]).filter((e: TestEvent) => e.type === 'pipeline_error');
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]).toMatchObject({ type: 'pipeline_error', error: 'LLM timeout' });
    expect(stopUsageTracking).toHaveBeenCalled();
  });

  it('uses custom emitError when provided', async () => {
    mockRunAgentLoop.mockRejectedValue(new Error('custom error'));
    const emit = vi.fn();
    const emitError = vi.fn();

    const config = makeProductConfig(
      [{ name: 'agent-a', config: makeAgentConfig('agent-a') }],
      { emitError },
    );

    const params = makeParams({ emit });

    await expect(runProductPipeline(config, params)).rejects.toThrow('custom error');

    expect(emitError).toHaveBeenCalledWith('start', 'custom error', emit);
  });
});
