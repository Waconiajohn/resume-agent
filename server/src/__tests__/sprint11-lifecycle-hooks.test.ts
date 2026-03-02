/**
 * Sprint 11 — Story 9: Wire Lifecycle Hooks in Agent Loop
 *
 * Tests that onInit and onShutdown hooks are called, including
 * when the loop throws.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runAgentLoop } from '../agents/runtime/agent-loop.js';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { AgentConfig, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';

// Mock llm module
vi.mock('../lib/llm.js', () => ({
  llm: {
    chat: vi.fn(),
  },
  MODEL_ORCHESTRATOR: 'test-orchestrator',
}));

// Mock retry to just call the function directly
vi.mock('../lib/retry.js', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

// Mock llm-provider for createCombinedAbortSignal
vi.mock('../lib/llm-provider.js', () => ({
  createCombinedAbortSignal: (signal: AbortSignal | undefined, _timeoutMs: number) => ({
    signal: signal ?? new AbortController().signal,
    cleanup: vi.fn(),
  }),
}));

import { llm } from '../lib/llm.js';

const mockLlm = vi.mocked(llm);

function makeConfig(overrides: Partial<AgentConfig<BaseState, BaseEvent>> = {}): AgentConfig<BaseState, BaseEvent> {
  return {
    identity: { name: 'test-agent', domain: 'test' },
    system_prompt: 'You are a test agent',
    tools: [],
    model: 'test-model',
    max_rounds: 3,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
    ...overrides,
  };
}

function makeContextParams() {
  return {
    sessionId: 'test',
    userId: 'test',
    state: {} as BaseState,
    emit: vi.fn(),
    waitForUser: vi.fn(),
    signal: new AbortController().signal,
    bus: new AgentBus(),
    identity: { name: 'test-agent', domain: 'test' },
  };
}

describe('Agent Loop — Lifecycle Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: LLM returns text-only (agent completes immediately)
    mockLlm.chat.mockResolvedValue({
      text: 'Done.',
      tool_calls: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
  });

  it('calls onInit before the first LLM round', async () => {
    const callOrder: string[] = [];

    const onInit = vi.fn(async () => {
      callOrder.push('onInit');
    });

    mockLlm.chat.mockImplementation(async () => {
      callOrder.push('llm');
      return {
        text: 'Done.',
        tool_calls: [],
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    });

    await runAgentLoop({
      config: makeConfig({ onInit }),
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    expect(onInit).toHaveBeenCalledTimes(1);
    expect(callOrder[0]).toBe('onInit');
    expect(callOrder[1]).toBe('llm');
  });

  it('calls onShutdown after loop completes', async () => {
    const onShutdown = vi.fn(async () => {});

    await runAgentLoop({
      config: makeConfig({ onShutdown }),
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it('calls onShutdown even when LLM throws', async () => {
    const onShutdown = vi.fn(async () => {});

    mockLlm.chat.mockRejectedValue(new Error('LLM exploded'));

    await expect(
      runAgentLoop({
        config: makeConfig({ onShutdown }),
        contextParams: makeContextParams(),
        initialMessage: 'Go',
      }),
    ).rejects.toThrow('LLM exploded');

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it('does not abort agent when onInit throws', async () => {
    const onInit = vi.fn(async () => {
      throw new Error('Init failed');
    });

    const result = await runAgentLoop({
      config: makeConfig({ onInit }),
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    // Agent should still complete successfully despite init failure
    expect(result.rounds_used).toBeGreaterThanOrEqual(1);
    expect(mockLlm.chat).toHaveBeenCalled();
  });

  it('does not mask loop error when onShutdown also throws', async () => {
    const onShutdown = vi.fn(async () => {
      throw new Error('Shutdown also failed');
    });

    mockLlm.chat.mockRejectedValue(new Error('LLM exploded'));

    await expect(
      runAgentLoop({
        config: makeConfig({ onShutdown }),
        contextParams: makeContextParams(),
        initialMessage: 'Go',
      }),
    ).rejects.toThrow('LLM exploded'); // Loop error propagates, not shutdown error

    expect(onShutdown).toHaveBeenCalledTimes(1);
  });

  it('works fine without hooks (no onInit, no onShutdown)', async () => {
    const result = await runAgentLoop({
      config: makeConfig(), // no hooks
      contextParams: makeContextParams(),
      initialMessage: 'Go',
    });

    expect(result.rounds_used).toBeGreaterThanOrEqual(1);
  });
});
