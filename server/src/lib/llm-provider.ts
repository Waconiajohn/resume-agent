import Anthropic from '@anthropic-ai/sdk';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getAnthropicClient } from './anthropic.js';

// ─── Shared interfaces ───────────────────────────────────────────────

export interface ChatParams {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  tool_choice?: { type: 'any' } | { type: 'auto' } | { type: 'none' };
  max_tokens: number;
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

/** Register a session for usage tracking. Returns the accumulator to read later. */
export function startUsageTracking(sessionId: string): UsageAccumulator {
  const acc: UsageAccumulator = { input_tokens: 0, output_tokens: 0 };
  sessionUsageAccumulators.set(sessionId, acc);
  return acc;
}

/** Scope downstream LLM calls to a specific session for usage accounting. */
export function setUsageTrackingContext(sessionId: string): void {
  usageContext.enterWith(sessionId);
}

/** Stop tracking and remove the accumulator. */
export function stopUsageTracking(sessionId: string): void {
  sessionUsageAccumulators.delete(sessionId);
}

/** Called internally after every chat() call to accumulate usage. */
function recordUsage(usage: { input_tokens: number; output_tokens: number }, sessionId?: string): void {
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

  // Backward-compatible fallback: if exactly one session is active, attribute usage to it.
  if (sessionUsageAccumulators.size === 1) {
    const acc = Array.from(sessionUsageAccumulators.values())[0];
    acc.input_tokens += usage.input_tokens;
    acc.output_tokens += usage.output_tokens;
  }
}

function createCombinedAbortSignal(
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
      recordUsage(usage, params.session_id);

      yield { type: 'done', usage };
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
}

export class ZAIProvider implements LLMProvider {
  readonly name = 'zai';
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ZAIConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const body = this.buildRequestBody(params, false);
    const { signal: combinedSignal, cleanup: cleanupCombinedSignal } = createCombinedAbortSignal(
      params.signal,
      180_000,
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
        throw new Error(`ZAI API error ${response.status}: ${errText}`);
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
      300_000,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

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
        throw new Error(`ZAI API error ${response.status}: ${errText}`);
      }

      if (!response.body) {
        throw new Error('ZAI API returned no body for stream');
      }

      // Parse SSE stream
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let inputTokens = 0;
      let outputTokens = 0;

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
      yield { type: 'done', usage: finalUsage };
    } finally {
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
        },
      }));
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

  private parseResponse(data: OpenAIChatResponse): ChatResponse {
    const choice = data.choices?.[0];
    const message = choice?.message;

    const text = message?.content ?? '';
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
    };
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
