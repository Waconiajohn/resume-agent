import Anthropic from '@anthropic-ai/sdk';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getAnthropicClient } from './anthropic.js';
import logger from './logger.js';
import { flushUsageToDb, clearUsageWatermark } from './usage-persistence.js';

// ─── Shared interfaces ───────────────────────────────────────────────

export interface ChatParams {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: { type: 'any' } | { type: 'auto' } | { type: 'none' };
  response_format?: { type: 'json_object' };
  max_tokens: number;
  temperature?: number;
  signal?: AbortSignal;
  session_id?: string;
}

/** Anthropic-style message with content blocks */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatResponse {
  text: string;
  tool_calls: ToolCall[];
  usage: { input_tokens: number; output_tokens: number };
  /** Why the model stopped generating. 'length' means output was truncated at max_tokens. */
  finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// ─── Stream events ───────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'done'; usage: { input_tokens: number; output_tokens: number } };

// ─── Per-session usage tracking ─────────────────────────────────────

export interface UsageAccumulator {
  input_tokens: number;
  output_tokens: number;
}

/**
 * Global per-session usage listeners. The pipeline registers an accumulator
 * before starting and reads it at the end. All llm.chat() calls made during
 * that session automatically accumulate usage.
 */
const sessionUsageAccumulators = new Map<string, UsageAccumulator>();
const usageContext = new AsyncLocalStorage<string>();

/** Maps sessionId -> { userId, intervalId } for periodic flush management. */
const sessionFlushIntervals = new Map<string, { userId: string; intervalId: ReturnType<typeof setInterval> }>();

const USAGE_FLUSH_INTERVAL_MS = 60_000;

/** Register a session for usage tracking. Returns the accumulator to read later. */
export function startUsageTracking(sessionId: string, userId?: string): UsageAccumulator {
  const acc: UsageAccumulator = { input_tokens: 0, output_tokens: 0 };
  sessionUsageAccumulators.set(sessionId, acc);

  if (userId) {
    // Cancel any existing interval for this session (e.g. on restart).
    const existing = sessionFlushIntervals.get(sessionId);
    if (existing) {
      clearInterval(existing.intervalId);
      sessionFlushIntervals.delete(sessionId);
    }

    const intervalId = setInterval(() => {
      const current = sessionUsageAccumulators.get(sessionId);
      if (!current) {
        // Accumulator was removed — stop the interval.
        clearInterval(intervalId);
        sessionFlushIntervals.delete(sessionId);
        return;
      }
      flushUsageToDb(sessionId, userId, { ...current }).catch((err: unknown) => {
        logger.warn(
          { session_id: sessionId, error: err instanceof Error ? err.message : String(err) },
          'startUsageTracking: periodic flush error',
        );
      });
    }, USAGE_FLUSH_INTERVAL_MS);
    intervalId.unref?.();

    sessionFlushIntervals.set(sessionId, { userId, intervalId });
  }

  return acc;
}

/** Scope downstream LLM calls to a specific session for usage accounting. */
export function setUsageTrackingContext(sessionId: string): void {
  usageContext.enterWith(sessionId);
}

/** Stop tracking, clear interval, do final flush, and remove the accumulator. */
export function stopUsageTracking(sessionId: string): void {
  // Clear the periodic flush interval first.
  const flushEntry = sessionFlushIntervals.get(sessionId);
  if (flushEntry) {
    clearInterval(flushEntry.intervalId);
    sessionFlushIntervals.delete(sessionId);

    // Final flush — best effort, non-blocking.
    const current = sessionUsageAccumulators.get(sessionId);
    if (current && (current.input_tokens > 0 || current.output_tokens > 0)) {
      flushUsageToDb(sessionId, flushEntry.userId, { ...current }).catch((err: unknown) => {
        logger.warn(
          { session_id: sessionId, error: err instanceof Error ? err.message : String(err) },
          'stopUsageTracking: final flush error',
        );
      }).finally(() => {
        clearUsageWatermark(sessionId);
      });
    } else {
      clearUsageWatermark(sessionId);
    }
  }

  sessionUsageAccumulators.delete(sessionId);
}

/** Called internally after every chat() call to accumulate usage. */
export function recordUsage(usage: { input_tokens: number; output_tokens: number }, sessionId?: string): void {
  // Prefer explicit session_id param, then fall back to AsyncLocalStorage context.
  const sid = sessionId ?? usageContext.getStore();
  if (sid) {
    const acc = sessionUsageAccumulators.get(sid);
    if (acc) {
      acc.input_tokens += usage.input_tokens;
      acc.output_tokens += usage.output_tokens;
      return;
    }
  }

  // Drop usage rather than silently misattribute it to an unrelated session.
  logger.warn(
    { sessionId, usage, activeAccumulatorCount: sessionUsageAccumulators.size },
    'recordUsage: no accumulator found for session, dropping usage to avoid misattribution',
  );
}

export function createCombinedAbortSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const timeoutController = new AbortController();
  const combinedController = new AbortController();
  const timeout = setTimeout(() => {
    timeoutController.abort(new Error(`Timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timeout.unref?.();

  const abortCombined = (reason?: unknown) => {
    if (combinedController.signal.aborted) return;
    combinedController.abort(reason);
  };

  const onCallerAbort = () => abortCombined(callerSignal?.reason);
  const onTimeoutAbort = () => abortCombined(timeoutController.signal.reason);

  if (callerSignal) {
    if (callerSignal.aborted) {
      onCallerAbort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }
  timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });

  const cleanup = () => {
    clearTimeout(timeout);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
    timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
    if (!timeoutController.signal.aborted) {
      timeoutController.abort();
    }
  };

  return { signal: combinedController.signal, cleanup };
}

// ─── Provider interface ──────────────────────────────────────────────

export interface LLMProvider {
  readonly name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  stream(params: ChatParams): AsyncIterable<StreamEvent>;
}

// ─── Anthropic provider ──────────────────────────────────────────────

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  async chat(params: ChatParams): Promise<ChatResponse> {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
      ...(params.tool_choice && { tool_choice: params.tool_choice as Anthropic.ToolChoice }),
    });

    let text = '';
    const tool_calls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        tool_calls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    const usage = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    };
    recordUsage(usage, params.session_id);

    return { text, tool_calls, usage };
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    const anthropic = getAnthropicClient();
    const { signal: combinedSignal, cleanup: cleanupCombinedSignal } = createCombinedAbortSignal(
      params.signal,
      300_000,
    );

    const streamParams: Parameters<typeof anthropic.messages.stream>[0] = {
      model: params.model,
      max_tokens: params.max_tokens,
      system: params.system,
      messages: params.messages as Anthropic.MessageParam[],
      tools: params.tools as Anthropic.Tool[],
    };
    if (params.tool_choice) {
      streamParams.tool_choice = params.tool_choice as Anthropic.ToolChoice;
    }

    const s = anthropic.messages.stream(streamParams);

    // Abort the stream if the combined signal fires
    const abortHandler = () => s.abort();
    combinedSignal.addEventListener('abort', abortHandler, { once: true });

    // Collect events and yield them
    let fullText = '';
    const toolCalls: ToolCall[] = [];

    const textListener = (text: string) => { fullText += text; };
    s.on('text', textListener);

    let partialUsage: { input_tokens: number; output_tokens: number } | null = null;
    try {
      const response = await s.finalMessage();

      // Yield text events from the accumulated text
      if (fullText) {
        yield { type: 'text', text: fullText };
      }

      // Extract tool calls from the response
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const tc: ToolCall = {
            id: block.id,
            name: block.name,
            input: block.input as Record<string, unknown>,
          };
          toolCalls.push(tc);
          yield { type: 'tool_call', ...tc };
        }
      }

      const usage = {
        input_tokens: response.usage?.input_tokens ?? 0,
        output_tokens: response.usage?.output_tokens ?? 0,
      };
      partialUsage = usage;
      recordUsage(usage, params.session_id);

      yield { type: 'done', usage };
    } catch (err) {
      // Record any partial usage that was accumulated before the interruption.
      // finalMessage() may throw on abort before usage is available, so we only
      // record if we have non-zero counts from the stream metadata.
      if (partialUsage == null) {
        const streamUsage = (s as unknown as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
        if (streamUsage && (streamUsage.input_tokens ?? 0) > 0) {
          recordUsage(
            {
              input_tokens: streamUsage.input_tokens ?? 0,
              output_tokens: streamUsage.output_tokens ?? 0,
            },
            params.session_id,
          );
        }
      }
      throw err;
    } finally {
      combinedSignal.removeEventListener('abort', abortHandler);
      cleanupCombinedSignal();
      s.off('text', textListener);
      s.abort();
    }
  }
}

// ─── ZAI provider (OpenAI-compatible) ────────────────────────────────

interface ZAIConfig {
  apiKey: string;
  baseUrl: string;
  /** Override provider name (default: 'zai'). Used by GroqProvider. */
  providerName?: string;
  /** Chat (non-streaming) timeout in ms. Default: 180_000 (3 min). */
  chatTimeoutMs?: number;
  /** Streaming timeout in ms. Default: 300_000 (5 min). */
  streamTimeoutMs?: number;
  /** Disable parallel tool calls. Groq's Llama models need this to avoid XML-format tool call failures. */
  disableParallelToolCalls?: boolean;
}

export class ZAIProvider implements LLMProvider {
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;
  private chatTimeoutMs: number;
  private streamTimeoutMs: number;
  private disableParallelToolCalls: boolean;

  constructor(config: ZAIConfig) {
    this.name = config.providerName ?? 'zai';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.chatTimeoutMs = config.chatTimeoutMs ?? 180_000;
    this.streamTimeoutMs = config.streamTimeoutMs ?? 300_000;
    this.disableParallelToolCalls = config.disableParallelToolCalls ?? false;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const body = this.buildRequestBody(params, false);
    const { signal: combinedSignal, cleanup: cleanupCombinedSignal } = createCombinedAbortSignal(
      params.signal,
      this.chatTimeoutMs,
    );
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');

        // Groq returns 400 with tool_use_failed when the model generates tool call
        // parameters that don't match the schema. Instead of crashing, try to recover
        // by extracting the failed_generation and parsing the tool calls ourselves.
        if (response.status === 400 && errText.includes('tool_use_failed')) {
          const recovered = this.recoverFromToolValidation(errText);
          if (recovered) {
            logger.warn({ provider: this.name }, 'Recovered tool call from Groq tool_use_failed response');
            return recovered;
          }
        }

        throw new Error(`${this.name} API error ${response.status}: ${errText}`);
      }

      const data = await response.json() as OpenAIChatResponse;
      const result = this.parseResponse(data);
      recordUsage(result.usage, params.session_id);
      return result;
    } finally {
      cleanupCombinedSignal();
    }
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    const body = this.buildRequestBody(params, true);
    const { signal: combinedSignal, cleanup: cleanupCombinedSignal } = createCombinedAbortSignal(
      params.signal,
      this.streamTimeoutMs,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    // Hoisted so the finally block can record partial usage on interruption.
    let inputTokens = 0;
    let outputTokens = 0;
    let usageRecorded = false;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${this.name} API error ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error(`${this.name} API returned no body for stream`);
      }

      // Parse SSE stream
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Accumulate tool calls across chunks (streamed incrementally)
      const pendingToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      let toolCallsFlushed = false;

      const flushToolCalls = function* (): Generator<StreamEvent> {
        if (toolCallsFlushed) return;
        toolCallsFlushed = true;
        for (const [, tc] of pendingToolCalls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.arguments);
          } catch { /* empty */ }
          yield { type: 'tool_call' as const, id: tc.id, name: tc.name, input };
        }
        pendingToolCalls.clear();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') {
            // Flush any pending tool calls (guard: only once)
            yield* flushToolCalls();
            const finalUsage = { input_tokens: inputTokens, output_tokens: outputTokens };
            recordUsage(finalUsage, params.session_id);
            usageRecorded = true;
            yield { type: 'done', usage: finalUsage };
            return;
          }

          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }

          // Track usage if present
          if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? inputTokens;
            outputTokens = chunk.usage.completion_tokens ?? outputTokens;
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            yield { type: 'text', text: delta.content };
          }

          // Tool calls (streamed incrementally)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (tc.id) {
                // First chunk for this tool call
                pendingToolCalls.set(idx, {
                  id: tc.id,
                  name: tc.function?.name ?? '',
                  arguments: tc.function?.arguments ?? '',
                });
              } else {
                // Continuation chunk — append arguments
                const existing = pendingToolCalls.get(idx);
                if (existing) {
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            }
          }

          // Check for finish_reason to flush tool calls (guard: only once)
          const finishReason = chunk.choices?.[0]?.finish_reason;
          if (finishReason === 'tool_calls' || finishReason === 'stop') {
            yield* flushToolCalls();
          }
        }
      }

      // If we get here without [DONE], still emit done
      const finalUsage = { input_tokens: inputTokens, output_tokens: outputTokens };
      recordUsage(finalUsage, params.session_id);
      usageRecorded = true;
      yield { type: 'done', usage: finalUsage };
    } finally {
      // Record partial usage on interruption (e.g. AbortError mid-stream).
      // Only fires when an exception escapes the try block — usageRecorded guards
      // against double-counting when the stream completed normally.
      if (!usageRecorded && (inputTokens > 0 || outputTokens > 0)) {
        recordUsage({ input_tokens: inputTokens, output_tokens: outputTokens }, params.session_id);
      }
      cleanupCombinedSignal();
      reader?.releaseLock();
    }
  }

  // ─── Translation helpers ─────────────────────────────────────────

  private buildRequestBody(params: ChatParams, stream: boolean): Record<string, unknown> {
    const messages = this.translateMessages(params.system, params.messages);
    const body: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.max_tokens,
      messages,
      stream,
      ...(params.temperature != null && { temperature: params.temperature }),
    };

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema,
          // Disable strict server-side parameter validation on Groq.
          // Groq validates tool call params against the schema and returns 400
          // for type mismatches (e.g. array vs object). Our agent loop handles
          // coercion defensively instead.
          ...(this.disableParallelToolCalls && { strict: false }),
        },
      }));

      if (this.disableParallelToolCalls) {
        body.parallel_tool_calls = false;
      }
    }

    if (params.tool_choice) {
      if (params.tool_choice.type === 'any') {
        body.tool_choice = 'required';
      } else if (params.tool_choice.type === 'none') {
        body.tool_choice = 'none';
      } else {
        body.tool_choice = 'auto';
      }
    }

    if (params.response_format) {
      body.response_format = params.response_format;
    }

    return body;
  }

  /**
   * Translate Anthropic-format messages to OpenAI-format messages.
   * System prompt becomes the first message with role 'system'.
   * Content blocks with type 'tool_use' on assistant messages become tool_calls.
   * Content blocks with type 'tool_result' on user messages become role 'tool' messages.
   */
  private translateMessages(system: string, messages: ChatMessage[]): OpenAIMessage[] {
    const result: OpenAIMessage[] = [];

    // System prompt as first message
    result.push({ role: 'system', content: system });

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        result.push({ role: msg.role, content: msg.content });
        continue;
      }

      // Content is an array of blocks
      const blocks = msg.content;

      if (msg.role === 'assistant') {
        // Collect text and tool_use blocks
        let textContent = '';
        const toolCalls: OpenAIToolCall[] = [];

        for (const block of blocks) {
          if (block.type === 'text' && block.text) {
            textContent += block.text;
          } else if (block.type === 'tool_use' && block.id && block.name) {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input ?? {}),
              },
            });
          }
        }

        const assistantMsg: OpenAIMessage = { role: 'assistant' };
        if (textContent) assistantMsg.content = textContent;
        if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        result.push(assistantMsg);
      } else if (msg.role === 'user') {
        // User messages may contain tool_result blocks (from tool execution)
        // and regular text/content. We need to split them: tool_results become
        // separate messages with role 'tool', everything else stays as user content.
        const textParts: string[] = [];
        const toolResults: Array<{ tool_call_id: string; content: string }> = [];

        for (const block of blocks) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            toolResults.push({
              tool_call_id: block.tool_use_id,
              content: block.content ?? '',
            });
          } else if (block.type === 'text' && block.text) {
            textParts.push(block.text);
          }
        }

        // Emit tool result messages first (they respond to the preceding assistant message)
        for (const tr of toolResults) {
          result.push({
            role: 'tool',
            tool_call_id: tr.tool_call_id,
            content: tr.content,
          });
        }

        // Then emit any remaining user text
        if (textParts.length > 0) {
          result.push({ role: 'user', content: textParts.join('\n') });
        }
      }
    }

    return result;
  }

  /**
   * Recover tool calls from Groq's tool_use_failed 400 response.
   * Groq includes the model's attempted tool call in `failed_generation`.
   * Handles both JSON format and XML format (<function=name>{params}</function>).
   *
   * When the model generates multiple tool calls (despite parallel_tool_calls=false),
   * we recover only the FIRST valid tool call. This prevents issues with truncated
   * multi-tool outputs and respects sequential execution semantics.
   *
   * With 70B as orchestrator (GA, reliable tool calling), this recovery should
   * trigger rarely. Kept as a safety net — monitor warn-level logs to verify.
   */
  private recoverFromToolValidation(errText: string): ChatResponse | null {
    try {
      const errData = JSON.parse(errText) as {
        error?: { failed_generation?: string };
      };
      const failedGen = errData?.error?.failed_generation;
      if (!failedGen) return null;

      const tool_calls: ToolCall[] = [];

      // Try JSON array format first: [{"name":"...", "parameters":{...}}]
      // The array may be truncated (Groq output limit exceeded), so parse
      // individual objects even if the overall array is invalid JSON.
      if (failedGen.trimStart().startsWith('[')) {
        const extracted = this.extractToolCallsFromTruncatedArray(failedGen);
        if (extracted.length > 0) {
          // Only take the first tool call — let the model call others in subsequent rounds
          const first = extracted[0];
          tool_calls.push({
            id: `recovered_${Date.now()}_0`,
            name: first.name,
            input: first.parameters ?? {},
          });
          logger.info(
            { recovered: 1, total: extracted.length, firstName: first.name },
            'Recovered first tool call from truncated array',
          );
          return { text: '', tool_calls, usage: { input_tokens: 0, output_tokens: 0 } };
        }
      }

      // Try complete JSON parse (single object or well-formed array)
      try {
        const parsed = JSON.parse(failedGen);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.name) {
          tool_calls.push({
            id: `recovered_${Date.now()}_0`,
            name: parsed[0].name,
            input: parsed[0].parameters ?? {},
          });
          return { text: '', tool_calls, usage: { input_tokens: 0, output_tokens: 0 } };
        }
        if (parsed?.name) {
          tool_calls.push({
            id: `recovered_${Date.now()}_0`,
            name: parsed.name,
            input: parsed.parameters ?? {},
          });
          return { text: '', tool_calls, usage: { input_tokens: 0, output_tokens: 0 } };
        }
      } catch { /* Not valid JSON — try XML format */ }

      // Try XML format: <function=name>{params}</function>
      const xmlPattern = /<function=([^>]+)>([\s\S]*?)<\/function>/g;
      const match = xmlPattern.exec(failedGen);
      if (match) {
        const name = match[1];
        let input: Record<string, unknown> = {};
        try {
          const paramsStr = match[2].replace(/\.\s*$/, '').trim();
          input = JSON.parse(paramsStr);
        } catch { /* empty */ }
        tool_calls.push({ id: `recovered_${Date.now()}_0`, name, input });
        return { text: '', tool_calls, usage: { input_tokens: 0, output_tokens: 0 } };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract complete tool call objects from a potentially truncated JSON array.
   * Groq may truncate output when the model generates too many tool calls,
   * resulting in "[{...},{...},{incomplete..." — this extracts the complete ones.
   */
  private extractToolCallsFromTruncatedArray(
    text: string,
  ): Array<{ name: string; parameters: Record<string, unknown> }> {
    const results: Array<{ name: string; parameters: Record<string, unknown> }> = [];

    // Find each top-level object in the array by tracking brace depth
    let depth = 0;
    let inString = false;
    let escape = false;
    let objStart = -1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }

      if (ch === '"' && !escape) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart >= 0) {
          const objStr = text.slice(objStart, i + 1);
          try {
            const obj = JSON.parse(objStr) as { name?: string; parameters?: Record<string, unknown> };
            if (obj.name) {
              results.push({ name: obj.name, parameters: obj.parameters ?? {} });
            }
          } catch {
            // Incomplete or malformed — skip
          }
          objStart = -1;
        }
      }
    }

    return results;
  }

  private parseResponse(data: OpenAIChatResponse): ChatResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;

    const rawContent = message?.content;
    const text = typeof rawContent === 'string'
      ? rawContent
      : (rawContent != null ? JSON.stringify(rawContent) : '');
    const tool_calls: ToolCall[] = [];

    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments);
        } catch { /* empty */ }
        tool_calls.push({
          id: tc.id,
          name: tc.function.name,
          input,
        });
      }
    }

    return {
      text,
      tool_calls,
      usage: {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
      },
      finish_reason: choice?.finish_reason as ChatResponse['finish_reason'] ?? undefined,
    };
  }
}

// ─── Groq provider (OpenAI-compatible, low-latency) ──────────────────

interface GroqConfig {
  apiKey: string;
  baseUrl?: string;
}

export class GroqProvider extends ZAIProvider {
  constructor(config: GroqConfig) {
    super({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.groq.com/openai/v1',
      providerName: 'groq',
      chatTimeoutMs: 75_000,  // 70B needs headroom for 16K-token experience sections + truncation retry
      streamTimeoutMs: 60_000,
      disableParallelToolCalls: true,
    });
  }
}

// ─── DeepSeek provider (OpenAI-compatible) ───────────────────────────

interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
}

export class DeepSeekProvider extends ZAIProvider {
  constructor(config: DeepSeekConfig) {
    super({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.deepseek.com',
      providerName: 'deepseek',
      chatTimeoutMs: 120_000,  // DeepSeek can be slower during peak hours
      streamTimeoutMs: 180_000,
      disableParallelToolCalls: false,
    });
  }
}

// ─── DeepInfra provider (US-hosted DeepSeek, OpenAI-compatible) ──────

export class DeepInfraProvider extends ZAIProvider {
  constructor(config: { apiKey: string; baseUrl?: string }) {
    super({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'https://api.deepinfra.com/v1/openai',
      providerName: 'deepinfra',
      chatTimeoutMs: 90_000,   // US-hosted, should be faster than direct DeepSeek
      streamTimeoutMs: 120_000,
      disableParallelToolCalls: false,
    });
  }
}

// ─── Google Vertex AI provider (OpenAI-compatible endpoint) ──────────
// Uses gcloud application default credentials for auth.
// Endpoint: https://{region}-aiplatform.googleapis.com/v1/projects/{project}/locations/{region}/endpoints/openapi

export class VertexProvider extends ZAIProvider {
  private tokenExpiry = 0;

  constructor(config: {
    project: string;
    region?: string;
    accessToken: string;
    baseUrl?: string;
  }) {
    const region = config.region ?? 'global';
    const baseUrl = config.baseUrl
      ?? (region === 'global'
        ? `https://aiplatform.googleapis.com/v1/projects/${config.project}/locations/global/endpoints/openapi`
        : `https://${region}-aiplatform.googleapis.com/v1/projects/${config.project}/locations/${region}/endpoints/openapi`);
    super({
      apiKey: config.accessToken || 'placeholder',
      baseUrl,
      providerName: 'vertex',
      chatTimeoutMs: 60_000,
      streamTimeoutMs: 90_000,
      disableParallelToolCalls: false,
    });
  }

  /**
   * Vertex requires the first message to be role 'user', not 'system'.
   * Merge the system prompt into the first user message and refresh the
   * gcloud access token before each call (tokens expire every ~60 min).
   */
  async chat(params: ChatParams): Promise<ChatResponse> {
    // Refresh access token if expired
    if (Date.now() > this.tokenExpiry) {
      try {
        const token = await getVertexAccessToken();
        (this as unknown as { apiKey: string }).apiKey = token;
        this.tokenExpiry = Date.now() + 50 * 60 * 1000;
      } catch (err) {
        throw new Error(`Vertex token refresh failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Merge system prompt into first user message for Vertex compatibility
    const firstUserMsg = params.messages[0];
    const firstUserContent = typeof firstUserMsg?.content === 'string' ? firstUserMsg.content : '';
    const mergedFirstMessage: ChatMessage = {
      role: 'user',
      content: `${params.system}\n\n---\n\n${firstUserContent}`,
    };

    return super.chat({
      ...params,
      system: '',  // Empty system — content merged into user message
      messages: [mergedFirstMessage, ...params.messages.slice(1)],
    });
  }
}

/**
 * Get a fresh access token from gcloud application default credentials.
 * Falls back to `gcloud auth print-access-token` if the metadata server is unavailable.
 */
export async function getVertexAccessToken(): Promise<string> {
  // Try the gcloud CLI first (works in dev)
  try {
    const { execSync } = await import('node:child_process');
    const token = execSync('gcloud auth print-access-token', { timeout: 5000 })
      .toString().trim();
    if (token && token.length > 20) return token;
  } catch {
    // Fall through
  }

  // Try GOOGLE_APPLICATION_CREDENTIALS service account
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile) {
    try {
      const { readFileSync } = await import('node:fs');
      const key = JSON.parse(readFileSync(keyFile, 'utf-8'));
      // For service accounts, we'd need to do JWT signing — complex.
      // For now, rely on gcloud CLI or env var.
      if (key.type === 'authorized_user' && key.access_token) {
        return key.access_token;
      }
    } catch {
      // Fall through
    }
  }

  // Last resort: check for explicit env var
  const envToken = process.env.VERTEX_ACCESS_TOKEN;
  if (envToken) return envToken;

  throw new Error(
    'Cannot get Vertex AI access token. Either run `gcloud auth application-default login` '
    + 'or set VERTEX_ACCESS_TOKEN environment variable.',
  );
}

// ─── Failover provider ───────────────────────────────────────────────

const FAILOVER_THRESHOLD = 3;
const RECOVERY_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Classify an error thrown by a provider's chat() or stream() method to
 * determine whether it warrants a failover attempt.
 *
 * Failover-worthy: 5xx HTTP errors, connection errors, timeouts.
 * NOT failover-worthy: 4xx errors (bad request, rate limit, auth), abort signals.
 */
function isFailoverWorthy(err: unknown): boolean {
  // Explicit abort — user cancelled the request, not a provider failure.
  if (err instanceof Error && err.name === 'AbortError') return false;

  if (err instanceof Error) {
    const msg = err.message;

    // HTTP 5xx — provider-side failure.
    if (/API error [5]\d{2}/.test(msg)) return true;

    // HTTP 4xx — client-side error (bad request, rate limit, auth).
    // These won't be fixed by switching providers, so don't failover.
    if (/API error [4]\d{2}/.test(msg)) return false;

    // Connection/network failures.
    if (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('fetch failed') ||
      msg.includes('network error') ||
      msg.includes('Failed to fetch')
    ) {
      return true;
    }

    // Timeouts from createCombinedAbortSignal (message set in that function).
    if (/Timed out after \d+ms/.test(msg)) return true;
  }

  return false;
}

/**
 * FailoverProvider wraps a primary LLMProvider and an optional fallback.
 * After FAILOVER_THRESHOLD consecutive failover-worthy errors on the primary,
 * it switches all subsequent calls to the fallback. After
 * RECOVERY_CHECK_INTERVAL_MS the primary is tried again.
 *
 * If no fallback is configured, errors pass through unchanged.
 */
export class FailoverProvider implements LLMProvider {
  private consecutiveFailures = 0;
  private failoverActive = false;
  private failoverActivatedAt = 0;

  constructor(
    private readonly primary: LLMProvider,
    private readonly fallback: LLMProvider | null,
  ) {}

  get name(): string {
    return this.activeProvider.name;
  }

  private get activeProvider(): LLMProvider {
    if (!this.failoverActive || !this.fallback) {
      return this.primary;
    }

    // Recovery check: after the window elapses, try the primary again.
    if (Date.now() - this.failoverActivatedAt > RECOVERY_CHECK_INTERVAL_MS) {
      this.consecutiveFailures = 0;
      this.failoverActive = false;
      logger.info(
        { primary: this.primary.name, fallback: this.fallback.name },
        'LLM failover: recovery window elapsed — switching back to primary provider',
      );
      return this.primary;
    }

    return this.fallback;
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const provider = this.activeProvider;
    try {
      const result = await provider.chat(params);
      // Successful call — reset failure counter if we were on primary.
      if (provider === this.primary) {
        this.consecutiveFailures = 0;
      }
      return result;
    } catch (err) {
      this.handleProviderError(err, provider);
      throw err;
    }
  }

  async *stream(params: ChatParams): AsyncIterable<StreamEvent> {
    const provider = this.activeProvider;
    try {
      yield* provider.stream(params);
      // Successful stream — reset failure counter if we were on primary.
      if (provider === this.primary) {
        this.consecutiveFailures = 0;
      }
    } catch (err) {
      this.handleProviderError(err, provider);
      throw err;
    }
  }

  private handleProviderError(err: unknown, provider: LLMProvider): void {
    if (provider !== this.primary) {
      // Errors on the fallback are logged but don't affect failover state.
      logger.warn(
        { fallback: provider.name, error: err instanceof Error ? err.message : String(err) },
        'LLM failover: error on fallback provider',
      );
      return;
    }

    if (!isFailoverWorthy(err)) return;
    if (!this.fallback) {
      logger.warn(
        { primary: provider.name, error: err instanceof Error ? err.message : String(err) },
        'LLM failover: primary provider error — no fallback configured, continuing without failover',
      );
      return;
    }

    this.consecutiveFailures++;
    logger.warn(
      {
        primary: provider.name,
        consecutiveFailures: this.consecutiveFailures,
        threshold: FAILOVER_THRESHOLD,
        error: err instanceof Error ? err.message : String(err),
      },
      'LLM failover: failover-worthy error on primary provider',
    );

    if (this.consecutiveFailures >= FAILOVER_THRESHOLD && !this.failoverActive) {
      this.failoverActive = true;
      this.failoverActivatedAt = Date.now();
      logger.warn(
        { primary: this.primary.name, fallback: this.fallback.name, threshold: FAILOVER_THRESHOLD },
        'LLM failover: threshold reached — switching to fallback provider',
      );
    }
  }
}

// ─── OpenAI-compatible type definitions (internal) ───────────────────

interface OpenAIMessage {
  role: string;
  content?: string;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface OpenAIStreamChunk {
  choices?: Array<{
    delta: {
      content?: string;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}
