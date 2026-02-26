/**
 * Agent Protocol — Standard types for the multi-agent system.
 *
 * Defines agent identity, tool interface, inter-agent messaging,
 * and agent configuration. Designed for the 33-agent platform.
 */

import type { PipelineSSEEvent, PipelineState } from '../types.js';

// ─── Agent Identity ──────────────────────────────────────────────────

export interface AgentIdentity {
  /** Unique agent name within its domain (e.g. 'strategist', 'craftsman') */
  name: string;
  /** Product domain (e.g. 'resume' for this product) */
  domain: string;
}

// ─── Tool Interface ──────────────────────────────────────────────────

/** JSON Schema for tool input — uses Record<string,unknown> for LLM provider compatibility */
export type ToolInputSchema = Record<string, unknown>;

/**
 * A tool available to an agent. The LLM sees `name`, `description`,
 * and `input_schema`. When it calls the tool, `execute` runs.
 */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  /** Which model tier to use for this tool's LLM calls (if any) */
  model_tier?: 'primary' | 'mid' | 'orchestrator' | 'light';
  execute: (input: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
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

export interface AgentConfig {
  identity: AgentIdentity;
  /** System prompt template — may include {{placeholders}} */
  system_prompt: string;
  tools: AgentTool[];
  /** LLM model to use for the agent's main loop */
  model: string;
  /** Max LLM round-trips per invocation */
  max_rounds: number;
  /** Timeout per individual round (ms) */
  round_timeout_ms: number;
  /** Timeout for entire agent invocation (ms) */
  overall_timeout_ms: number;
}

// ─── Agent Context (passed to tools) ─────────────────────────────────

export interface AgentContext {
  readonly sessionId: string;
  readonly userId: string;

  /** Emit an SSE event to the frontend */
  emit: (event: PipelineSSEEvent) => void;

  /** Pause for user input at a gate */
  waitForUser: <T>(gate: string) => Promise<T>;

  /** Read from the shared pipeline state */
  getState: () => PipelineState;

  /** Update the shared pipeline state */
  updateState: (patch: Partial<PipelineState>) => void;

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
export function toToolDef(tool: AgentTool): ToolDef {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  };
}
