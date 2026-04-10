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

import { llm } from '../../lib/llm.js';
import { withRetry } from '../../lib/retry.js';
import { createCombinedAbortSignal } from '../../lib/llm-provider.js';
import { captureErrorWithContext } from '../../lib/sentry.js';
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

/** Scratchpad key where the agent loop stores the final assistant text. */
export const FINAL_TEXT_KEY = '_final_text' as const;
const DEFAULT_ROUND_TIMEOUT_MS = 120_000;   // 2 min per round
const DEFAULT_OVERALL_TIMEOUT_MS = 600_000; // 10 min total

// Sliding window to prevent context overflow on long sessions (Bug 17).
// When message count exceeds MAX, keep the initial instruction + last KEEP_RECENT messages.
// Raised from 30/20 → 60/40 for Groq's 70B model (131K context window).
// Compaction should rarely trigger with these limits but remains as a safety net.
const MAX_HISTORY_MESSAGES = 60;
const KEEP_RECENT_MESSAGES = 40;

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

  // Overall timeout — one combined signal for the agent's entire lifetime.
  const { signal: overallSignal, cleanup: cleanupOverall } = createCombinedAbortSignal(
    ctx.signal,
    overallTimeoutMs,
  );

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

      // Per-round scoped signal: each round's LLM call and tools derive from this
      // rather than from overallSignal directly. This bounds listener accumulation
      // to a constant per round — roundCleanup() removes all listeners after the
      // round completes (or exits early), regardless of how many rounds have run.
      const { signal: roundSignal, cleanup: roundCleanup } = createCombinedAbortSignal(
        overallSignal,
        roundTimeoutMs,
      );

      // Round-scoped context so tool execution uses the per-round timeout signal.
      const roundCtx: AgentContext<TState, TEvent> = { ...ctx, signal: roundSignal };

      // Track whether to break after this round's finally block runs.
      let shouldBreak = false;

      try {
        // Emit transparency event via a type-safe cast. The loop emits a generic
        // transparency marker that works with any product's event union.
        // Products must include `{ type: 'transparency'; stage: string; message: string }`
        // in their event union for this to surface to the frontend.
        try {
          const state = ctx.getState() as Record<string, unknown>;
          const stage = typeof state['current_stage'] === 'string' ? state['current_stage'] : 'unknown';
          ctx.emit({
            type: 'transparency',
            stage,
            message: `${config.identity.name}: round ${round + 1}/${maxRounds}`,
          } as unknown as TEvent);
        } catch {
          // Transparency emit is non-critical — swallow errors
        }

        let response: Awaited<ReturnType<typeof llm.chat>>;
        try {
          // Call LLM with retry, using the per-round signal
          response = await withRetry(
          () => llm.chat({
            model: config.model,
            system: config.system_prompt,
            messages,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            tool_choice: toolDefs.length > 0 ? { type: 'auto' } : undefined,
            max_tokens: config.loop_max_tokens ?? 4096,
            signal: roundSignal,
            session_id: ctx.sessionId,
          }),
          {
            maxAttempts: 3,
            baseDelay: 2000,
            signal: roundSignal,
            onRetry: (attempt, err) => {
              log.warn({ attempt, error: err.message }, 'Agent LLM call retry');
            },
          },
        );

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        // No tool calls — agent is done this round
        if (response.tool_calls.length === 0) {
          log.info({ round, text: response.text.slice(0, 200) }, 'Agent completed (no tool calls)');

          // Store final text in scratchpad
          if (response.text) {
            ctx.scratchpad[FINAL_TEXT_KEY] = response.text;
          }
          shouldBreak = true;
        } else {
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
            const coercedInput = coerceToolParameters(tc.input, tool.input_schema);

            try {
              const result = await executeToolWithTimeout<TState, TEvent>(tool, coercedInput, roundCtx, roundTimeoutMs);
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
                const coercedInput = coerceToolParameters(tc.input, tool.input_schema);
                const result = await executeToolWithTimeout<TState, TEvent>(tool, coercedInput, roundCtx, roundTimeoutMs);
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

          // Compact conversation history to prevent context overflow on long sessions.
          // Note: compaction fires only after tool-result append (not after assistant
          // message append), so the exact message count at compaction may vary by ±1 per round.
          if (messages.length > MAX_HISTORY_MESSAGES) {
            compactConversationHistory(
              messages,
              log,
              ctx.scratchpad,
              config.scratchpadSummaryHook,
              config.compactionHints,
            );
          }
        }
        } catch (err) {
          // Capture LLM timeout/abort errors to Sentry for observability
          const isTimeout = (err instanceof Error) && (
            err.name === 'AbortError' ||
            err.message.includes('timeout') ||
            err.message.includes('aborted')
          );
          if (isTimeout) {
            const state = ctx.getState() as Record<string, unknown>;
            const stage = typeof state['current_stage'] === 'string' ? state['current_stage'] : 'unknown';
            captureErrorWithContext(err, {
              severity: 'P2',
              category: 'llm_timeout',
              sessionId: ctx.sessionId,
              stage,
            });
          }
          throw err;
        }
      } finally {
        // Always release per-round listeners, regardless of normal/error/abort exit.
        roundCleanup();
      }

      if (shouldBreak) break;
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
 * Build a generic scratchpad status summary for compaction messages.
 * Lists scratchpad keys so the model knows what data is available.
 * Products can override this via AgentConfig.scratchpadSummaryHook.
 * @internal Exported for testing only.
 */
export function buildScratchpadSummary(scratchpad: Record<string, unknown>): string {
  const keys = Object.keys(scratchpad).filter(k => k !== FINAL_TEXT_KEY && scratchpad[k] != null);
  if (keys.length === 0) return '';
  return `Scratchpad data available: ${keys.slice(0, 20).join(', ')}`;
}

/**
 * Extract key evidence from dropped conversation messages to build
 * a richer compaction summary. Keeps the summary bounded (~500 tokens).
 *
 * @param dropped - Messages that were dropped during compaction
 * @param hints - Optional product-specific entity names and outcome patterns.
 *   If not provided, skips entity detection and returns a minimal summary.
 */
function extractDroppedMessageSummary(
  dropped: ChatMessage[],
  hints?: { sectionNames?: string[]; outcomePatterns?: RegExp[] },
): string {
  const sectionNames = hints?.sectionNames ?? [];
  const outcomePatterns = hints?.outcomePatterns ?? [];

  // If no hints provided, skip entity detection entirely
  if (sectionNames.length === 0 && outcomePatterns.length === 0) {
    return 'Their results are preserved in the scratchpad.';
  }

  const sections = new Set<string>();
  const outcomes: string[] = [];

  for (const msg of dropped) {
    let content: string;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = (msg.content as unknown as Array<Record<string, unknown>>)
        .filter(b => b['type'] === 'text' || b['type'] === 'tool_result')
        .map(b => String(b['text'] ?? b['content'] ?? ''))
        .join(' ');
    } else {
      content = '';
    }
    if (!content) continue;

    // Detect domain entity names mentioned
    for (const name of sectionNames) {
      if (content.toLowerCase().includes(name.replace(/_/g, ' ')) ||
          content.toLowerCase().includes(name)) {
        sections.add(name.replace(/_/g, ' '));
      }
    }

    // Detect outcomes using product-provided patterns
    for (const pattern of outcomePatterns) {
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
 * Includes scratchpad status so the model remembers completed work.
 *
 * @param scratchpadSummaryHook - Optional product hook to build a rich scratchpad summary.
 *   Falls back to the generic buildScratchpadSummary() if not provided.
 * @param compactionHints - Optional product-specific entity names and outcome patterns
 *   for richer dropped-message summarisation.
 */
function compactConversationHistory(
  messages: ChatMessage[],
  log: Pick<ReturnType<typeof logger.child>, 'info'>,
  scratchpad?: Record<string, unknown>,
  scratchpadSummaryHook?: (scratchpad: Record<string, unknown>) => string,
  compactionHints?: { sectionNames?: string[]; outcomePatterns?: RegExp[] },
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
  const summaryParts = extractDroppedMessageSummary(droppedMessages, compactionHints);

  // Use product hook if provided, otherwise fall back to generic key listing
  const scratchpadStatus = scratchpad
    ? (scratchpadSummaryHook ? scratchpadSummaryHook(scratchpad) : buildScratchpadSummary(scratchpad))
    : '';

  const summaryMessage: ChatMessage = {
    role: 'user',
    content: [
      `[System note: ${droppedCount} earlier messages (${Math.floor(droppedCount / 2)} tool rounds) were compacted to stay within context limits.`,
      summaryParts,
      scratchpadStatus,
      'Continue with the remaining work based on your initial instructions and recent context. Do NOT re-do sections that are already completed.]',
    ].filter(Boolean).join('\n'),
  };

  // Bridge is always needed: initialMessage(user) + summaryMessage(user) creates
  // consecutive user messages. The bridge ensures proper role alternation.
  const bridgeMessage: ChatMessage = {
    role: 'assistant',
    content: 'Understood. Continuing with the remaining work.',
  };

  // Mutate in place — splice out the middle and replace
  messages.length = 0;
  messages.push(initialMessage, summaryMessage, bridgeMessage);
  for (const m of recentMessages) {
    messages.push(m);
  }
}

/**
 * Coerce stringified JSON in tool parameters back to objects/arrays.
 * Smaller LLMs (Groq 8B, Scout 17B) sometimes pass `"[]"` or `"{'key':'val'}"`
 * as strings instead of proper JSON objects. This defensively parses them based
 * on the tool's input_schema.
 *
 * With 70B as orchestrator this should trigger rarely. Kept as a safety net —
 * monitor warn-level logs to verify reduction.
 */
function coerceToolParameters(
  input: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return input;
  const properties = schema.properties as Record<string, { type?: string }> | undefined;
  if (!properties) return input;

  let coerced = false;
  const result = { ...input };

  for (const [key, propSchema] of Object.entries(properties)) {
    const value = result[key];
    if (typeof value !== 'string') continue;

    const expectedType = propSchema?.type;
    if (expectedType === 'object' || expectedType === 'array') {
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object' && parsed !== null) {
          result[key] = parsed;
          coerced = true;
        }
      } catch {
        // Not valid JSON — leave as-is, tool execution will handle the error
      }
    }
  }

  if (coerced) {
    logger.warn({ keys: Object.keys(result).filter(k => result[k] !== input[k]) },
      'coerceToolParameters: stringified params detected (monitor: should be rare with 70B)');
  }

  return result;
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
  const isInteractive = tool.isInteractive ??
                        (tool.name.includes('interview') ||
                        tool.name.includes('present_to_user') ||
                        tool.name.includes('questionnaire'));

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
