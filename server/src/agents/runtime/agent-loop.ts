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

  // Overall timeout
  const { signal: overallSignal, cleanup: cleanupOverall } = createCombinedAbortSignal(
    ctx.signal,
    overallTimeoutMs,
  );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let round = 0;

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
          max_tokens: 8192,
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

      // Execute tool calls
      const resultBlocks: ContentBlock[] = [];
      for (const tc of response.tool_calls) {
        const tool = toolMap.get(tc.name);
        if (!tool) {
          log.warn({ toolName: tc.name }, 'Unknown tool called');
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
          });
          continue;
        }

        log.info({ tool: tc.name, round }, 'Executing tool');

        try {
          const result = await executeToolWithTimeout<TState, TEvent>(tool, tc.input, ctx, roundTimeoutMs);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: resultStr,
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          log.error({ tool: tc.name, error: errorMsg }, 'Tool execution error');
          resultBlocks.push({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: JSON.stringify({ error: errorMsg }),
          });
        }
      }

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
 * Compact the conversation history to stay within context window limits.
 * Keeps the initial instruction (first message) and the most recent messages,
 * replacing the middle with a brief summary note.
 */
function compactConversationHistory(
  messages: ChatMessage[],
  log: Pick<ReturnType<typeof logger.child>, 'info'>,
): void {
  if (messages.length <= MAX_HISTORY_MESSAGES) return;

  const initialMessage = messages[0]; // Initial user instruction (blueprint, evidence, etc.)
  const droppedCount = messages.length - 1 - KEEP_RECENT_MESSAGES;
  const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);

  log.info(
    { before: messages.length, dropped: droppedCount, kept: KEEP_RECENT_MESSAGES + 2 },
    'Compacting conversation history to prevent context overflow',
  );

  // Build a summary marker so the LLM knows history was compacted
  const summaryMessage: ChatMessage = {
    role: 'user',
    content: `[System note: ${droppedCount} earlier messages (${Math.floor(droppedCount / 2)} tool rounds) were compacted to stay within context limits. Their results are preserved in the scratchpad. Continue with the remaining work based on your initial instructions and recent context.]`,
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
