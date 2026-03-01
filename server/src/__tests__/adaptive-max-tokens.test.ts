/**
 * Adaptive max_tokens Tests
 *
 * Verifies that:
 *   1. runAgentLoop passes config.loop_max_tokens to the LLM chat call
 *   2. runAgentLoop defaults to 4096 when loop_max_tokens is not configured
 *   3. runSectionWriter uses 2048 for skills / education / certifications / header sections
 *   4. runSectionWriter uses 3072 for summary / professional_summary sections
 *   5. runSectionWriter uses 4096 for experience and other content-heavy sections
 *
 * The LLM is mocked; we inspect the `max_tokens` parameter passed to llm.chat().
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
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

vi.mock('../lib/llm-provider.js', () => ({
  createCombinedAbortSignal: vi.fn((_callerSignal: AbortSignal | undefined, _timeoutMs: number) => {
    const controller = new AbortController();
    return { signal: controller.signal, cleanup: vi.fn() };
  }),
}));

// ATS rules are a large string constant; stub it to avoid loading the full module.
vi.mock('../agents/ats-rules.js', () => ({
  ATS_RULEBOOK_SNIPPET: 'ATS rules stub',
  runAtsComplianceCheck: vi.fn().mockReturnValue([]),
}));

// json-repair is used by section-writer; stub it to return input as-is.
vi.mock('../lib/json-repair.js', () => ({
  repairJSON: vi.fn((text: string) => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────

import { runAgentLoop } from '../agents/runtime/agent-loop.js';
import { runSectionWriter } from '../agents/section-writer.js';
import type { AgentConfig, AgentTool, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';
import { AgentBus } from '../agents/runtime/agent-bus.js';
import type { SectionWriterInput } from '../agents/types.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** A terminal LLM response with no tool calls — stops the agent loop. */
function makeLLMTextResponse(text = 'Done') {
  return {
    text,
    tool_calls: [],
    usage: { input_tokens: 5, output_tokens: 5 },
  };
}

/** A section-writer LLM response that parses cleanly. */
function makeSectionWriterLLMResponse() {
  return {
    text: JSON.stringify({
      content: 'Engineering executive with 12+ years building cloud-native platforms.',
      keywords_used: ['cloud-native'],
      requirements_addressed: ['engineering leadership'],
      evidence_ids_used: ['ev_001'],
    }),
    tool_calls: [],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

interface TestState extends BaseState { value?: string }
interface TestEvent extends BaseEvent { type: string }

function makeBus(): AgentBus {
  return new AgentBus();
}

function makeContextParams() {
  return {
    sessionId: 'test-session-' + randomUUID(),
    userId: 'test-user',
    state: { value: 'initial' } as TestState,
    emit: vi.fn(),
    waitForUser: vi.fn().mockResolvedValue({}),
    signal: new AbortController().signal,
    bus: makeBus(),
    identity: { name: 'test-agent', domain: 'test' },
  };
}

function makeAgentConfig(options?: {
  loop_max_tokens?: number;
  tools?: AgentTool<TestState, TestEvent>[];
}): AgentConfig<TestState, TestEvent> {
  return {
    identity: { name: 'test-agent', domain: 'test' },
    system_prompt: 'You are a test agent.',
    tools: options?.tools ?? [],
    model: 'mock-orchestrator',
    max_rounds: 3,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
    loop_max_tokens: options?.loop_max_tokens,
  };
}

/** Build a minimal SectionWriterInput for the given section. */
function makeSectionInput(section: string, overrides?: Partial<SectionWriterInput>): SectionWriterInput {
  return {
    section,
    blueprint_slice: {
      positioning_angle: 'Engineering executive',
      must_include: ['leadership'],
      keywords_to_embed: ['cloud-native'],
      authentic_phrases_to_echo: [],
      length: '3-4 sentences',
      tone_guidance: 'Direct',
    },
    evidence_sources: {
      evidence_library: [
        {
          id: 'ev_001',
          situation: 'Legacy infra',
          action: 'Led migration',
          result: 'Saved $2.4M',
        },
      ],
    },
    global_rules: {
      voice: 'Executive, direct.',
      bullet_format: 'Action → scope → result',
      length_target: '2 pages',
      ats_rules: 'No tables',
    },
    ...overrides,
  };
}

// ─── Tests: agent-loop loop_max_tokens ───────────────────────────────────────

describe('runAgentLoop — loop_max_tokens', () => {
  beforeEach(() => {
    mockChat.mockReset();
    vi.clearAllMocks();
  });

  it('passes loop_max_tokens to the LLM chat call', async () => {
    mockChat.mockResolvedValueOnce(makeLLMTextResponse('Done.'));

    const config = makeAgentConfig({ loop_max_tokens: 1024 });
    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Start',
    });

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 1024 }),
    );
  });

  it('defaults to 4096 when loop_max_tokens is not configured', async () => {
    mockChat.mockResolvedValueOnce(makeLLMTextResponse('Done.'));

    const config = makeAgentConfig(); // loop_max_tokens omitted
    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Start',
    });

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
    );
  });

  it('uses the configured loop_max_tokens across multiple rounds', async () => {
    // Round 1 calls a tool, round 2 returns text — both LLM calls use the same max_tokens
    const noopTool: AgentTool<TestState, TestEvent> = {
      name: 'noop',
      description: 'No-op tool',
      input_schema: {},
      execute: async () => ({ done: true }),
    };

    mockChat
      .mockResolvedValueOnce({
        text: '',
        tool_calls: [{ id: randomUUID(), name: 'noop', input: {} }],
        usage: { input_tokens: 10, output_tokens: 10 },
      })
      .mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeAgentConfig({ loop_max_tokens: 2048, tools: [noopTool] });
    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Start',
    });

    expect(mockChat).toHaveBeenCalledTimes(2);
    for (const call of mockChat.mock.calls) {
      expect((call[0] as { max_tokens: number }).max_tokens).toBe(2048);
    }
  });

  it('passes the configured model to the LLM call alongside loop_max_tokens', async () => {
    mockChat.mockResolvedValueOnce(makeLLMTextResponse());

    const config = makeAgentConfig({ loop_max_tokens: 512 });
    config.model = 'mock-mid';

    await runAgentLoop({
      config,
      contextParams: makeContextParams(),
      initialMessage: 'Start',
    });

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-mid',
        max_tokens: 512,
      }),
    );
  });
});

// ─── Tests: section-writer adaptive max_tokens ───────────────────────────────

describe('runSectionWriter — adaptive max_tokens', () => {
  beforeEach(() => {
    mockChat.mockReset();
  });

  // ── 2048 sections ──────────────────────────────────────────────────────────

  it('uses max_tokens=2048 for the skills section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('skills'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  it('uses max_tokens=2048 for the education section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('education'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  it('uses max_tokens=2048 for the certifications section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('certifications'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  it('uses max_tokens=2048 for the education_and_certifications section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('education_and_certifications'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  it('uses max_tokens=2048 for the header section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('header'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 2048 }),
    );
  });

  // ── 3072 sections ──────────────────────────────────────────────────────────

  it('uses max_tokens=3072 for the summary section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('summary'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 3072 }),
    );
  });

  it('uses max_tokens=3072 for the professional_summary section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('professional_summary'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 3072 }),
    );
  });

  // ── 4096 sections ──────────────────────────────────────────────────────────

  it('uses max_tokens=4096 for the experience section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('experience'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
    );
  });

  it('uses max_tokens=4096 for the selected_accomplishments section', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('selected_accomplishments'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
    );
  });

  it('uses max_tokens=4096 for unknown / custom section names', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('publications'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
    );
  });

  // ── Model routing is consistent with max_tokens routing ───────────────────

  it('uses MODEL_MID (not MODEL_PRIMARY) for the skills section alongside 2048 tokens', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('skills'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-mid',
        max_tokens: 2048,
      }),
    );
  });

  it('uses MODEL_PRIMARY for the summary section alongside 3072 tokens', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('summary'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-primary',
        max_tokens: 3072,
      }),
    );
  });

  it('uses MODEL_PRIMARY for the experience section alongside 4096 tokens', async () => {
    mockChat.mockResolvedValueOnce(makeSectionWriterLLMResponse());

    await runSectionWriter(makeSectionInput('experience'));

    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mock-primary',
        max_tokens: 4096,
      }),
    );
  });
});
