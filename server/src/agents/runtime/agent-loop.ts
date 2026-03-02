/**
 * Agent Loop — Core agentic loop for multi-round LLM + tool calling.
 *
 * Each agent runs as a loop:
 *   1. Send messages + tools to LLM
 *   2. If LLM calls tools → execute them, append results, loop
 *   3. If LLM returns text only → agent turn complete
 *   4. Respect max_rounds, per-round timeout, overall timeout
 *
 * Uses the existing llm-provider.ts infrastructure (streaming, usage tracking).
 */

import { randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { llm } from '../../lib/llm.js';
import { withRetry } from '../../lib/retry.js';
import { createCombinedAbortSignal } from '../../lib/llm-provider.js';
import type { ChatMessage, ContentBlock } from '../../lib/llm-provider.js';
import type {
  AgentConfig,
  AgentContext,
  AgentResult,
  AgentTool,
  BaseState,
  BaseEvent,
} from './agent-protocol.js';
import { toToolDef } from './agent-protocol.js';
import { createAgentContext, type CreateContextParams } from './agent-context.js';
import logger from '../../lib/logger.js';

// ─── Constants ───────────────────────────────────────────────────────

const DEFAULT_MAX_ROUNDS = 10;
const DEFAULT_ROUND_TIMEOUT_MS = 120_000;   // 2 min per round
const DEFAULT_OVERALL_TIMEOUT_MS = 600_000; // 10 min total

// Sliding window to prevent context overflow on long sessions (Bug 17).
// When message count exceeds MAX, keep the initial instruction + last KEEP_RECENT messages.
const MAX_HISTORY_MESSAGES = 30;
const KEEP_RECENT_MESSAGES = 20;

// ─── Public API ──────────────────────────────────────────────────────

export interface RunAgentParams<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  config: AgentConfig<TState, TEvent>;
  contextParams: CreateContextParams<TState, TEvent>;
  /** Initial user message to start the agent */
  initialMessage: string;
  /** Pre-existing conversation to continue from */
  priorMessages?: ChatMessage[];
}

/**
 * Run an agent loop to completion.
 *
 * The agent calls tools autonomously until it decides it's done
 * (returns text without tool calls) or hits max_rounds.
 */
export async function runAgentLoop<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
>(params: RunAgentParams<TState, TEvent>): Promise<AgentResult> {
  const { config, contextParams, initialMessage, priorMessages } = params;
  const { ctx, internals } = createAgentContext(contextParams);
  const log = logger.child({ agent: config.identity.name, session: ctx.sessionId });

  const maxRounds = config.max_rounds || DEFAULT_MAX_ROUNDS;
  const roundTimeoutMs = config.round_timeout_ms || DEFAULT_ROUND_TIMEOUT_MS;
  const overallTimeoutMs = config.overall_timeout_ms || DEFAULT_OVERALL_TIMEOUT_MS;

  // Build tool map for quick lookup
  const toolMap = new Map<string, AgentTool<TState, TEvent>>();
  for (const tool of config.tools) {
    toolMap.set(tool.name, tool);
  }

  // Build tool definitions for LLM
  const toolDefs = config.tools.map(toToolDef);

  // Build conversation messages
  const messages: ChatMessage[] = priorMessages ? [...priorMessages] : [];
  if (initialMessage) {
    messages.push({ role: 'user', content: initialMessage });
  }

  // Prevent MaxListenersExceededWarning: ctx.signal accumulates one listener per tool
  // execution (from executeToolWithTimeout) plus one for the overall signal below.
  // Parallel tool rounds can have many live listeners simultaneously.
  setMaxListeners(50, ctx.signal);

  // Overall timeout
  const { signal: overallSignal, cleanup: cleanupOverall } = createCombinedAbortSignal(
    ctx.signal,
    overallTimeoutMs,
  );

  // Prevent MaxListenersExceededWarning: overallSignal accumulates one listener per
  // LLM call (from createCombinedAbortSignal inside llm-provider.ts). With up to
  // maxRounds × maxAttempts calls over the agent's lifetime, counts can exceed the
  // default limit of 10, even though each listener is removed in its finally block.
  setMaxListeners(50, overallSignal);

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let round = 0;

  // Call onInit lifecycle hook before the first LLM round
  if (config.onInit) {
    try {
      await config.onInit(ctx);
      log.info('Agent onInit hook completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ err }, `Agent onInit hook failed: ${message}`);
      // Init errors are logged but don't abort the agent
    }
  }

  try {
    for (round = 0; round < maxRounds; round++) {
      if (overallSignal.aborted) {
        log.warn({ round }, 'Agent loop aborted (overall timeout or signal)');
        break;
      }

      log.info({ round, messageCount: messages.length }, 'Agent round start');

      // Emit transparency event. The loop emits a generic transparency marker;
      // cast is safe because BaseEvent allows any extra string fields.
      ctx.emit({
        type: 'transparency',
        stage: (ctx.getState() as Record<string, unknown>)['current_stage'] as string,
        message: `${config.identity.name}: round ${round + 1}/${maxRounds}`,
      } as unknown as Parameters<typeof ctx.emit>[0]);

      // Call LLM with retry
      const response = await withRetry(
        () => llm.chat({
          model: config.model,
          system: config.system_prompt,
          messages,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          tool_choice: toolDefs.length > 0 ? { type: 'auto' } : undefined,
          max_tokens: config.loop_max_tokens ?? 4096,
          signal: overallSignal,
          session_id: ctx.sessionId,
        }),
        {
          maxAttempts: 3,
          baseDelay: 2000,
          signal: overallSignal,
          onRetry: (attempt, err) => {
            log.warn({ attempt, error: err.message }, 'Agent LLM call retry');
          },
        },
      );

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      // No tool calls — agent is done
      if (response.tool_calls.length === 0) {
        log.info({ round, text: response.text.slice(0, 200) }, 'Agent completed (no tool calls)');

        // Store final text in scratchpad
        if (response.text) {
          ctx.scratchpad._final_text = response.text;
        }
        break;
      }

      // Build assistant message with tool calls
      const assistantBlocks: ContentBlock[] = [];
      if (response.text) {
        assistantBlocks.push({ type: 'text', text: response.text });
      }
      for (const tc of response.tool_calls) {
        assistantBlocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      messages.push({ role: 'assistant', content: assistantBlocks });

      // Execute tool calls — parallel-safe tools run concurrently, others sequentially first
      const parallelSafeSet = new Set(config.parallel_safe_tools ?? []);
      const sequentialCalls = response.tool_calls.filter(tc => !parallelSafeSet.has(tc.name));
      const parallelCalls = response.tool_calls.filter(tc => parallelSafeSet.has(tc.name));

      // Map tool_use_id → result block for ordered reassembly
      const resultMap = new Map<string, ContentBlock>();

      // 1. Execute sequential tools first (order matters)
      for (const tc of sequentialCalls) {
        const tool = toolMap.get(tc.name);
        if (!tool) {
          log.warn({ toolName: tc.name }, 'Unknown tool called');
          resultMap.set(tc.id, {
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
          });
          continue;
        }

        log.info({ tool: tc.name, round }, 'Executing tool (sequential)');

        try {
          const result = await executeToolWithTimeout<TState, TEvent>(tool, tc.input, ctx, roundTimeoutMs);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          resultMap.set(tc.id, {
            type: 'tool_result',
            tool_use_id: tc.id,
            content: resultStr,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          log.error({ tool: tc.name, error: errorMsg }, 'Tool execution error');
          resultMap.set(tc.id, {
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify({ error: errorMsg }),
          });
        }
      }

      // 2. Execute parallel-safe tools concurrently
      if (parallelCalls.length > 0) {
        log.info(
          { tools: parallelCalls.map(tc => tc.name), round },
          `Executing ${parallelCalls.length} tools in parallel`,
        );

        const settled = await Promise.allSettled(
          parallelCalls.map(async (tc) => {
            const tool = toolMap.get(tc.name);
            if (!tool) {
              log.warn({ toolName: tc.name }, 'Unknown tool called');
              return { id: tc.id, content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }) };
            }
            log.info({ tool: tc.name, round }, 'Executing tool (parallel)');
            const result = await executeToolWithTimeout<TState, TEvent>(tool, tc.input, ctx, roundTimeoutMs);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
            return { id: tc.id, content: resultStr };
          }),
        );

        for (let i = 0; i < parallelCalls.length; i++) {
          const tc = parallelCalls[i];
          const outcome = settled[i];
          if (outcome.status === 'fulfilled') {
            resultMap.set(tc.id, {
              type: 'tool_result',
              tool_use_id: outcome.value.id,
              content: outcome.value.content,
            });
          } else {
            const errorMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
            log.error({ tool: tc.name, error: errorMsg }, 'Parallel tool execution error');
            resultMap.set(tc.id, {
              type: 'tool_result',
              tool_use_id: tc.id,
              content: JSON.stringify({ error: errorMsg }),
            });
          }
        }
      }

      // 3. Reassemble results in original tool_calls order
      const resultBlocks: ContentBlock[] = response.tool_calls.map(
        tc => resultMap.get(tc.id)!,
      );

      // Append tool results as user message
      messages.push({ role: 'user', content: resultBlocks });

      // Compact conversation history to prevent context overflow on long sessions
      if (messages.length > MAX_HISTORY_MESSAGES) {
        compactConversationHistory(messages, log);
      }
    }

    if (round >= maxRounds) {
      log.warn({ maxRounds }, 'Agent hit max rounds');
    }
  } finally {
    // Call onShutdown lifecycle hook — guaranteed to run even if loop throws
    if (config.onShutdown) {
      try {
        await config.onShutdown(ctx);
        log.info('Agent onShutdown hook completed');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ err }, `Agent onShutdown hook failed: ${message}`);
        // Shutdown errors are logged but don't mask loop errors
      }
    }
    cleanupOverall();
  }

  return {
    scratchpad: ctx.scratchpad,
    messages_out: internals.messagesOut,
    usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
    rounds_used: round + 1,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract key evidence from dropped conversation messages to build
 * a richer compaction summary. Keeps the summary bounded (~500 tokens).
 */
function extractDroppedMessageSummary(dropped: ChatMessage[]): string {
  const sections = new Set<string>();
  const outcomes: string[] = [];

  // Common section names to look for
  const SECTION_NAMES = [
    'summary', 'professional_summary', 'experience', 'skills',
    'education', 'education_and_certifications', 'certifications',
    'selected_accomplishments', 'header',
  ];

  const OUTCOME_PATTERNS = [
    /(?:wrote|completed|approved|revised|presented)\s+(?:the\s+)?["']?(\w[\w_\s]*?)["']?\s+section/i,
    /section[_\s]+(?:draft|revised|approved).*?["'](\w[\w_\s]*?)["']/i,
    /self.review.*?score.*?(\d+)/i,
  ];

  for (const msg of dropped) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (!content) continue;

    // Detect section names mentioned
    for (const name of SECTION_NAMES) {
      if (content.toLowerCase().includes(name.replace(/_/g, ' ')) ||
          content.toLowerCase().includes(name)) {
        sections.add(name.replace(/_/g, ' '));
      }
    }

    // Detect outcomes
    for (const pattern of OUTCOME_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        outcomes.push(match[0].slice(0, 80));
      }
    }
  }

  const parts: string[] = [];
  if (sections.size > 0) {
    parts.push(`Sections referenced: ${[...sections].join(', ')}.`);
  }
  if (outcomes.length > 0) {
    // Deduplicate and limit to 5 outcomes
    const unique = [...new Set(outcomes)].slice(0, 5);
    parts.push(`Key outcomes: ${unique.join('; ')}.`);
  }
  if (parts.length === 0) {
    parts.push('Their results are preserved in the scratchpad.');
  }

  // Bound to ~500 tokens (~2000 chars)
  const result = parts.join(' ');
  return result.length > 2000 ? result.slice(0, 2000) + '...' : result;
}

/**
 * Compact the conversation history to stay within context window limits.
 * Keeps the initial instruction (first message) and the most recent messages,
 * replacing the middle with a structured summary of what was dropped.
 */
function compactConversationHistory(
  messages: ChatMessage[],
  log: Pick<ReturnType<typeof logger.child>, 'info'>,
): void {
  if (messages.length <= MAX_HISTORY_MESSAGES) return;

  const initialMessage = messages[0]; // Initial user instruction (blueprint, evidence, etc.)
  const droppedCount = messages.length - 1 - KEEP_RECENT_MESSAGES;
  const droppedMessages = messages.slice(1, messages.length - KEEP_RECENT_MESSAGES);
  const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);

  log.info(
    { before: messages.length, dropped: droppedCount, kept: KEEP_RECENT_MESSAGES + 2 },
    'Compacting conversation history to prevent context overflow',
  );

  // Extract key evidence from dropped messages for a richer summary
  const summaryParts = extractDroppedMessageSummary(droppedMessages);

  const summaryMessage: ChatMessage = {
    role: 'user',
    content: [
      `[System note: ${droppedCount} earlier messages (${Math.floor(droppedCount / 2)} tool rounds) were compacted to stay within context limits.`,
      summaryParts,
      'Continue with the remaining work based on your initial instructions and recent context.]',
    ].filter(Boolean).join('\n'),
  };

  // Ensure proper message alternation: if recent starts with user, we need an assistant between
  const needsBridge = recentMessages[0]?.role === 'user';
  const bridgeMessage: ChatMessage = {
    role: 'assistant',
    content: 'Understood. Continuing with the remaining work.',
  };

  // Mutate in place — splice out the middle and replace
  messages.length = 0;
  messages.push(initialMessage, summaryMessage);
  if (needsBridge) {
    messages.push(bridgeMessage);
  }
  messages.push(...recentMessages);
}

async function executeToolWithTimeout<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(
  tool: AgentTool<TState, TEvent>,
  input: Record<string, unknown>,
  ctx: AgentContext<TState, TEvent>,
  timeoutMs: number,
): Promise<unknown> {
  // Tools that wait for user interaction should not be time-limited by the
  // per-round timeout — the user may take minutes to respond. These tools are
  // still bounded by the overall pipeline timeout via ctx.signal.
  const isInteractive = tool.name.includes('interview') ||
                        tool.name.includes('present_to_user') ||
                        tool.name.includes('questionnaire');

  if (isInteractive) {
    return await tool.execute(input, ctx);
  }

  const { signal, cleanup } = createCombinedAbortSignal(ctx.signal, timeoutMs);
  try {
    // Create a child context with the tool's timeout signal
    const toolCtx: AgentContext<TState, TEvent> = { ...ctx, signal };
    return await tool.execute(input, toolCtx);
  } finally {
    cleanup();
  }
}
