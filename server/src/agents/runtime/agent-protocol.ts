/**
 * Agent Protocol — Standard types for the multi-agent system.
 *
 * Defines agent identity, tool interface, inter-agent messaging,
 * and agent configuration. Designed for the 33-agent platform.
 *
 * This module is intentionally domain-agnostic. It contains no imports
 * from product-specific code. State and event types are generic parameters
 * so any product can bind its own concrete types at the product layer.
 */

// ─── Agent Identity ──────────────────────────────────────────────────

export interface AgentIdentity {
  /** Unique agent name within its domain (e.g. 'strategist', 'craftsman') */
  name: string;
  /** Product domain (e.g. 'resume' for this product) */
  domain: string;
}

// ─── Base types for generic parameters ───────────────────────────────

/** Minimal shape for any SSE event emitted by an agent */
export type BaseEvent = { type: string };

/** Minimal shape for shared pipeline/session state */
export type BaseState = object;

// ─── Tool Interface ──────────────────────────────────────────────────

/** JSON Schema for tool input — uses Record<string,unknown> for LLM provider compatibility */
export type ToolInputSchema = Record<string, unknown>;

/**
 * A tool available to an agent. The LLM sees `name`, `description`,
 * and `input_schema`. When it calls the tool, `execute` runs.
 *
 * TState — the shared state type this tool reads/writes (default: BaseState)
 * TEvent — the SSE event union this tool can emit (default: BaseEvent)
 */
export interface AgentTool<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  /** Which model tier to use for this tool's LLM calls (if any) */
  model_tier?: 'primary' | 'mid' | 'orchestrator' | 'light';
  execute: (input: Record<string, unknown>, ctx: AgentContext<TState, TEvent>) => Promise<unknown>;
}

// ─── Inter-Agent Messages ────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'handoff' | 'request' | 'response' | 'notification';
  domain: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

// ─── Agent Configuration ─────────────────────────────────────────────

/**
 * TState — the shared state type tools in this agent read/write
 * TEvent — the SSE event union tools in this agent can emit
 */
export interface AgentConfig<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  identity: AgentIdentity;
  /** System prompt template — may include {{placeholders}} */
  system_prompt: string;
  tools: AgentTool<TState, TEvent>[];
  /** LLM model to use for the agent's main loop */
  model: string;
  /** Max LLM round-trips per invocation */
  max_rounds: number;
  /** Timeout per individual round (ms) */
  round_timeout_ms: number;
  /** Timeout for entire agent invocation (ms) */
  overall_timeout_ms: number;
  /**
   * Tools that are safe to execute in parallel within a single round.
   * When the LLM calls multiple tools in one round, tools listed here
   * run concurrently via Promise.allSettled(). Unlisted tools run sequentially first.
   */
  parallel_safe_tools?: string[];
  /**
   * Max tokens for the agent's main loop LLM calls.
   * Orchestrator calls rarely need the full 8192 — lower values reduce latency.
   * Default: 4096.
   */
  loop_max_tokens?: number;
}

// ─── Agent Context (passed to tools) ─────────────────────────────────

/**
 * TState — the shared state type this context exposes (default: BaseState)
 * TEvent — the SSE event union this context can emit (default: BaseEvent)
 */
export interface AgentContext<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  readonly sessionId: string;
  readonly userId: string;

  /** Emit an SSE event to the frontend */
  emit: (event: TEvent) => void;

  /** Pause for user input at a gate */
  waitForUser: <T>(gate: string) => Promise<T>;

  /** Read from the shared pipeline state */
  getState: () => TState;

  /** Update the shared pipeline state */
  updateState: (patch: Partial<TState>) => void;

  /** Agent-local scratchpad — accumulates results across rounds */
  scratchpad: Record<string, unknown>;

  /** AbortSignal for the current agent invocation */
  signal: AbortSignal;

  /** Send a message to another agent via the bus */
  sendMessage: (msg: Omit<AgentMessage, 'id' | 'from' | 'timestamp'>) => void;
}

// ─── Agent Result ────────────────────────────────────────────────────

export interface AgentResult {
  /** Agent's accumulated scratchpad at completion */
  scratchpad: Record<string, unknown>;
  /** Messages sent to other agents during execution */
  messages_out: AgentMessage[];
  /** Token usage for this agent invocation */
  usage: { input_tokens: number; output_tokens: number };
  /** How many LLM rounds were used */
  rounds_used: number;
}

// ─── Tool Definition for LLM (subset of AgentTool sent to LLM) ──────

export interface ToolDef {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

/** Extract the ToolDef subset from an AgentTool (for LLM API calls) */
export function toToolDef<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
>(tool: AgentTool<TState, TEvent>): ToolDef {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  };
}
