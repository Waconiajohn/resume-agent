/**
 * Agent Loop — Parallel Tool Execution Tests
 *
 * Tests the parallel_safe_tools mechanism added to runAgentLoop:
 *   - Tools listed in parallel_safe_tools run concurrently via Promise.allSettled()
 *   - Tools NOT listed run sequentially first
 *   - Results are reassembled in the original tool_calls order
 *   - An error in one parallel tool does not kill its siblings
 *   - Unknown tools return an error result in both sequential and parallel paths
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

// ─── Hoist mocks ──────────────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

// ─── vi.mock declarations (top-level, before imports) ─────────────────────────

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MAX_TOKENS: 8192,
  getModelForTool: vi.fn(() => 'mock-orchestrator'),
  getDefaultModel: vi.fn(() => 'mock-orchestrator'),
  getMaxTokens: vi.fn(() => 8192),
}));

vi.mock('../lib/retry.js', () => ({
  // Pass-through: just call fn() so the retry wrapper is transparent
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../lib/logger.js', () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return { default: noopLogger };
});

// createCombinedAbortSignal must return a real signal + cleanup so the loop
// can call it safely. We use an actual AbortController here.
vi.mock('../lib/llm-provider.js', () => ({
  createCombinedAbortSignal: vi.fn((_callerSignal: AbortSignal | undefined, _timeoutMs: number) => {
    const controller = new AbortController();
    return { signal: controller.signal, cleanup: vi.fn() };
  }),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { runAgentLoop } from '../agents/runtime/agent-loop.js';
import type { AgentConfig, AgentContext, AgentTool, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';
import { AgentBus } from '../agents/runtime/agent-bus.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal ChatResponse that the mock LLM returns.
 * tool_calls is the list of tools the LLM "decides" to call.
 */
function makeLLMToolCallResponse(toolCalls: Array<{ name: string; input?: Record<string, unknown> }>) {
  return {
    text: '',
    tool_calls: toolCalls.map(tc => ({
      id: randomUUID(),
      name: tc.name,
      input: tc.input ?? {},
    })),
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

/** A terminal response (no tool calls) — causes the loop to stop */
function makeLLMTextResponse(text = 'Done') {
  return {
    text,
    tool_calls: [],
    usage: { input_tokens: 5, output_tokens: 5 },
  };
}

/** Create a minimal AgentBus for the context params */
function makeBus(): AgentBus {
  return new AgentBus();
}

/** Shared state type used in tests */
interface TestState extends BaseState {
  value?: string;
}

/** Shared event type used in tests */
interface TestEvent extends BaseEvent {
  type: string;
}

/** Create context params that satisfy CreateContextParams */
function makeContextParams(stateOverrides?: Partial<TestState>) {
  const bus = makeBus();
  return {
    sessionId: 'test-session-' + randomUUID(),
    userId: 'test-user',
    state: { value: 'initial', ...stateOverrides } as TestState,
    emit: vi.fn(),
    waitForUser: vi.fn().mockResolvedValue({}),
    signal: new AbortController().signal,
    bus,
    identity: { name: 'test-agent', domain: 'test' },
  };
}

/** Build a minimal AgentConfig with the given tools and parallel_safe_tools */
function makeConfig(
  tools: AgentTool<TestState, TestEvent>[],
  options?: {
    parallel_safe_tools?: string[];
    loop_max_tokens?: number;
  },
): AgentConfig<TestState, TestEvent> {
  return {
    identity: { name: 'test-agent', domain: 'test' },
    system_prompt: 'You are a test agent.',
    tools,
    model: 'mock-orchestrator',
    max_rounds: 5,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
    parallel_safe_tools: options?.parallel_safe_tools,
    loop_max_tokens: options?.loop_max_tokens,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runAgentLoop — parallel_safe_tools', () => {
  beforeEach(() => {
    mockChat.mockReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. All tools sequential (no parallel_safe_tools configured) ───────────

  it('executes all tools sequentially when parallel_safe_tools is not configured', async () => {
    const executionOrder: string[] = [];

    const toolA: AgentTool<TestState, TestEvent> = {
      name: 'tool_a',
      description: 'Tool A',
      input_schema: {},
      execute: async (_input, _ctx) => {
        executionOrder.push('tool_a:start');
        await new Promise(resolve => setTimeout(resolve, 20));
        executionOrder.push('tool_a:end');
        return { result: 'a' };
      },
    };

    const toolB: AgentTool<TestState, TestEvent> = {
      name: 'tool_b',
      description: 'Tool B',
      input_schema: {},
      execute: async (_input, _ctx) => {
        executionOrder.push('tool_b:start');
        await new Promise(resolve => setTimeout(resolve, 10));
        executionOrder.push('tool_b:end');
        return { result: 'b' };
      },
    };

    // Round 1: LLM calls both tools. Round 2: LLM returns text (stop).
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'tool_a' }, { name: 'tool_b' }]))
      .mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeConfig([toolA, toolB]); // No parallel_safe_tools
    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // Sequential: tool_a must fully complete before tool_b starts
    expect(executionOrder.indexOf('tool_a:start')).toBeLessThan(executionOrder.indexOf('tool_a:end'));
    expect(executionOrder.indexOf('tool_a:end')).toBeLessThan(executionOrder.indexOf('tool_b:start'));
    expect(executionOrder.indexOf('tool_b:start')).toBeLessThan(executionOrder.indexOf('tool_b:end'));
  });

  // ── 2. All tools parallel ─────────────────────────────────────────────────

  it('executes all tools concurrently when all are in parallel_safe_tools', async () => {
    const startTimes: Record<string, number> = {};
    const endTimes: Record<string, number> = {};
    const DELAY_MS = 80;

    const makeParallelTool = (name: string, delayMs: number): AgentTool<TestState, TestEvent> => ({
      name,
      description: `Tool ${name}`,
      input_schema: {},
      execute: async () => {
        startTimes[name] = Date.now();
        await new Promise(resolve => setTimeout(resolve, delayMs));
        endTimes[name] = Date.now();
        return { result: name };
      },
    });

    const toolA = makeParallelTool('tool_a', DELAY_MS);
    const toolB = makeParallelTool('tool_b', DELAY_MS);

    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'tool_a' }, { name: 'tool_b' }]))
      .mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeConfig([toolA, toolB], {
      parallel_safe_tools: ['tool_a', 'tool_b'],
    });

    const t0 = Date.now();
    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });
    const elapsed = Date.now() - t0;

    // If sequential: would take >= 2 * DELAY_MS. Parallel: ~DELAY_MS.
    // Allow generous margin (3x) to avoid flakiness, but sequential would exceed 2x.
    expect(elapsed).toBeLessThan(DELAY_MS * 3);

    // Both tools should have started before either finished
    const bothStartedBeforeEitherEnded =
      startTimes['tool_a'] < endTimes['tool_b'] &&
      startTimes['tool_b'] < endTimes['tool_a'];
    expect(bothStartedBeforeEitherEnded).toBe(true);
  });

  // ── 3. Mixed round: sequential first, then parallel ───────────────────────

  it('runs sequential tools first, then parallel tools concurrently in a mixed round', async () => {
    const phaseOrder: string[] = [];

    const seqTool: AgentTool<TestState, TestEvent> = {
      name: 'seq_tool',
      description: 'Sequential tool',
      input_schema: {},
      execute: async () => {
        phaseOrder.push('seq_tool');
        return { result: 'sequential' };
      },
    };

    const parToolA: AgentTool<TestState, TestEvent> = {
      name: 'par_a',
      description: 'Parallel tool A',
      input_schema: {},
      execute: async () => {
        phaseOrder.push('par_a:start');
        await new Promise(resolve => setTimeout(resolve, 30));
        phaseOrder.push('par_a:end');
        return { result: 'parallel_a' };
      },
    };

    const parToolB: AgentTool<TestState, TestEvent> = {
      name: 'par_b',
      description: 'Parallel tool B',
      input_schema: {},
      execute: async () => {
        phaseOrder.push('par_b:start');
        await new Promise(resolve => setTimeout(resolve, 10));
        phaseOrder.push('par_b:end');
        return { result: 'parallel_b' };
      },
    };

    // LLM calls seq_tool first, then both parallel tools in the same round
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([
        { name: 'seq_tool' },
        { name: 'par_a' },
        { name: 'par_b' },
      ]))
      .mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeConfig([seqTool, parToolA, parToolB], {
      parallel_safe_tools: ['par_a', 'par_b'],
    });

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // seq_tool must run before either parallel tool starts
    expect(phaseOrder[0]).toBe('seq_tool');

    // Both parallel starts must come after seq_tool
    const seqIdx = phaseOrder.indexOf('seq_tool');
    const parAStartIdx = phaseOrder.indexOf('par_a:start');
    const parBStartIdx = phaseOrder.indexOf('par_b:start');
    expect(parAStartIdx).toBeGreaterThan(seqIdx);
    expect(parBStartIdx).toBeGreaterThan(seqIdx);
  });

  // ── 4. Error in one parallel tool does not kill siblings ─────────────────

  it('completes sibling parallel tools when one throws', async () => {
    const siblingCompleted = { value: false };

    const failingTool: AgentTool<TestState, TestEvent> = {
      name: 'failing_tool',
      description: 'Always throws',
      input_schema: {},
      execute: async () => {
        throw new Error('Intentional parallel failure');
      },
    };

    const survivingTool: AgentTool<TestState, TestEvent> = {
      name: 'surviving_tool',
      description: 'Runs despite sibling failure',
      input_schema: {},
      execute: async () => {
        siblingCompleted.value = true;
        return { result: 'survived' };
      },
    };

    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([
        { name: 'failing_tool' },
        { name: 'surviving_tool' },
      ]))
      .mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeConfig([failingTool, survivingTool], {
      parallel_safe_tools: ['failing_tool', 'surviving_tool'],
    });

    // The loop itself should NOT throw — errors are caught per tool
    await expect(
      runAgentLoop({
        config,
        contextParams: makeContextParams(),
        initialMessage: 'Go',
      }),
    ).resolves.not.toThrow();

    // The surviving sibling must have run
    expect(siblingCompleted.value).toBe(true);
  });

  it('returns an error result block for the failed parallel tool', async () => {
    const failingTool: AgentTool<TestState, TestEvent> = {
      name: 'failing_tool',
      description: 'Always throws',
      input_schema: {},
      execute: async () => {
        throw new Error('boom');
      },
    };

    // Second round: LLM receives the error result and we can inspect the conversation
    let capturedMessages: unknown[] | undefined;
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'failing_tool' }]))
      .mockImplementationOnce(async (params: { messages: unknown[] }) => {
        capturedMessages = params.messages;
        return makeLLMTextResponse();
      });

    const config = makeConfig([failingTool], {
      parallel_safe_tools: ['failing_tool'],
    });

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // The last user message (tool results) should contain the error content
    const lastMsg = capturedMessages?.[capturedMessages.length - 1] as { role: string; content: unknown[] };
    expect(lastMsg).toBeDefined();
    expect(lastMsg.role).toBe('user');

    const resultBlock = (lastMsg.content as Array<{ type: string; content?: string }>).find(
      (b) => b.type === 'tool_result',
    );
    expect(resultBlock).toBeDefined();
    expect(resultBlock?.content).toContain('boom');
  });

  // ── 5. Results maintain original tool_calls order ─────────────────────────

  it('reassembles tool results in the original tool_calls order regardless of execution order', async () => {
    // tool_fast completes before tool_slow, but tool_slow was called first by the LLM.
    // The result blocks sent back to the LLM must maintain the original order.
    let capturedMessages: unknown[] | undefined;

    const slowTool: AgentTool<TestState, TestEvent> = {
      name: 'slow_tool',
      description: 'Slow',
      input_schema: {},
      execute: async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'slow' };
      },
    };

    const fastTool: AgentTool<TestState, TestEvent> = {
      name: 'fast_tool',
      description: 'Fast',
      input_schema: {},
      execute: async () => {
        // Resolves almost immediately
        return { result: 'fast' };
      },
    };

    // LLM calls slow_tool first, fast_tool second
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([
        { name: 'slow_tool' },
        { name: 'fast_tool' },
      ]))
      .mockImplementationOnce(async (params: { messages: unknown[] }) => {
        capturedMessages = params.messages;
        return makeLLMTextResponse();
      });

    const config = makeConfig([slowTool, fastTool], {
      parallel_safe_tools: ['slow_tool', 'fast_tool'],
    });

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // The tool results user message should have slow_tool result first
    const lastMsg = capturedMessages?.[capturedMessages.length - 1] as {
      role: string;
      content: Array<{ type: string; content?: string; tool_use_id?: string }>;
    };
    expect(lastMsg).toBeDefined();

    const resultBlocks = lastMsg.content.filter(b => b.type === 'tool_result');
    expect(resultBlocks).toHaveLength(2);

    // Verify content is present and in call order (slow first, fast second)
    expect(resultBlocks[0].content).toContain('slow');
    expect(resultBlocks[1].content).toContain('fast');
  });

  // ── 6. Unknown tool returns error in sequential path ─────────────────────

  it('returns an error result for an unknown tool in the sequential path', async () => {
    let capturedMessages: unknown[] | undefined;

    // No tools registered — LLM calls 'phantom_tool' which doesn't exist
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'phantom_tool' }]))
      .mockImplementationOnce(async (params: { messages: unknown[] }) => {
        capturedMessages = params.messages;
        return makeLLMTextResponse();
      });

    const config = makeConfig([]); // No tools — no parallel_safe_tools either

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    const lastMsg = capturedMessages?.[capturedMessages.length - 1] as {
      role: string;
      content: Array<{ type: string; content?: string }>;
    };
    const resultBlock = lastMsg.content.find(b => b.type === 'tool_result');
    expect(resultBlock).toBeDefined();
    expect(resultBlock?.content).toContain('Unknown tool: phantom_tool');
  });

  // ── 6b. Unknown tool returns error in parallel path ───────────────────────

  it('returns an error result for an unknown tool in the parallel path', async () => {
    let capturedMessages: unknown[] | undefined;

    // parallel_safe_tools lists 'ghost_tool', but it is not registered
    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'ghost_tool' }]))
      .mockImplementationOnce(async (params: { messages: unknown[] }) => {
        capturedMessages = params.messages;
        return makeLLMTextResponse();
      });

    const config = makeConfig([], {
      parallel_safe_tools: ['ghost_tool'],
    });

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    const lastMsg = capturedMessages?.[capturedMessages.length - 1] as {
      role: string;
      content: Array<{ type: string; content?: string }>;
    };
    const resultBlock = lastMsg.content.find(b => b.type === 'tool_result');
    expect(resultBlock).toBeDefined();
    expect(resultBlock?.content).toContain('Unknown tool: ghost_tool');
  });

  // ── 7. Loop completes when no tool calls are returned ────────────────────

  it('completes immediately when the first LLM response has no tool calls', async () => {
    mockChat.mockResolvedValueOnce(makeLLMTextResponse('I am done right away.'));

    const config = makeConfig([]);
    const result = await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // Should have completed in 1 round (no tool calls fired)
    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(result.scratchpad['_final_text']).toBe('I am done right away.');
  });

  // ── 8. AgentResult shape is correct ──────────────────────────────────────

  it('returns correct AgentResult shape after tool execution', async () => {
    const simpleTool: AgentTool<TestState, TestEvent> = {
      name: 'simple_tool',
      description: 'Does something',
      input_schema: {},
      execute: async () => ({ done: true }),
    };

    mockChat
      .mockResolvedValueOnce(makeLLMToolCallResponse([{ name: 'simple_tool' }]))
      .mockResolvedValueOnce(makeLLMTextResponse('All done.'));

    const config = makeConfig([simpleTool], {
      parallel_safe_tools: ['simple_tool'],
    });

    const result = await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    expect(result).toHaveProperty('scratchpad');
    expect(result).toHaveProperty('messages_out');
    expect(result).toHaveProperty('usage');
    expect(result).toHaveProperty('rounds_used');
    expect(result.usage.input_tokens).toBeGreaterThan(0);
    expect(result.usage.output_tokens).toBeGreaterThan(0);
    expect(Array.isArray(result.messages_out)).toBe(true);
  });
});
