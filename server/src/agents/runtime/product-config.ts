/**
 * Product Configuration — Type contract for any product on the platform.
 *
 * Any product (resume, cover letter, LinkedIn profile, etc.) implements
 * ProductConfig to get a fully functional multi-agent pipeline from
 * `runProductPipeline()`.
 *
 * This module is domain-agnostic. TState and TEvent are generic parameters
 * that each product binds to its own concrete types.
 */

import type { AgentConfig, AgentMessage, BaseState, BaseEvent } from './agent-protocol.js';

// ─── Gate Definitions ────────────────────────────────────────────────

/**
 * A user-interaction gate that pauses the pipeline for input.
 * Optionally conditional — only fires when `condition(state)` returns true.
 */
export interface GateDef<TState extends BaseState = BaseState> {
  /** Gate name passed to waitForUser() (e.g. 'architect_review') */
  name: string;
  /**
   * When should this gate fire? Evaluated after the agent completes.
   * If omitted, the gate always fires.
   */
  condition?: (state: TState) => boolean;
  /**
   * Optional handler to process the gate response before the next agent runs.
   * Receives the raw user response, the current state, and an optional emit
   * function for sending SSE events to the frontend.
   */
  onResponse?: (response: unknown, state: TState, emit?: (event: BaseEvent) => void) => void;
  /**
   * After onResponse, should the owning agent re-run to incorporate feedback?
   * When true, the coordinator rebuilds the agent message (which now includes
   * revision_feedback from onResponse), re-runs the agent loop, then re-fires
   * this gate so the user can approve the revision.
   * Defaults to 3 re-runs to prevent infinite loops. Products with intentional
   * multi-step gates may raise this with maxReruns.
   */
  requiresRerun?: (state: TState) => boolean;
  maxReruns?: number;
}

// ─── Agent Phase ─────────────────────────────────────────────────────

/**
 * One phase (agent) in a product's pipeline.
 * Phases are executed in order by the generic coordinator.
 */
export interface AgentPhase<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  /** Human-readable agent name (e.g. 'strategist', 'writer') */
  name: string;
  /** Agent configuration (system prompt, tools, timeouts, etc.) */
  config: AgentConfig<TState, TEvent>;
  /**
   * Gates to check after this agent completes.
   * Evaluated in order; first matching gate pauses the pipeline.
   */
  gates?: GateDef<TState>[];
  /**
   * Optional callback after the agent loop completes.
   * Use for post-processing like transferring scratchpad data to state.
   */
  onComplete?: (
    scratchpad: Record<string, unknown>,
    state: TState,
    emit: (event: TEvent) => void,
  ) => void;
  /**
   * Optional: emit stage_start/stage_complete events around this agent.
   * Product decides the stage names and messages.
   */
  stageMessage?: {
    /** Stage name emitted in stage_start (e.g. 'intake', 'section_writing') */
    startStage: string;
    /** Human-readable message for stage_start */
    start: string;
    /** Stage name emitted in stage_complete (defaults to startStage if omitted) */
    completeStage?: string;
    /** Human-readable message for stage_complete */
    complete: string;
  };
}

// ─── Inter-Agent Handler ─────────────────────────────────────────────

/**
 * Declarative handler for inter-agent communication patterns (e.g., revision requests).
 * The generic coordinator subscribes these to the bus and manages their lifecycle.
 */
export interface InterAgentHandler<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  /** Bus subscription key — which agent's messages to listen for (e.g. 'craftsman') */
  listenTo: string;
  /** Handler called when a message arrives for the subscribed agent */
  handler: (
    msg: AgentMessage,
    state: TState,
    ctx: {
      emit: (event: TEvent) => void;
      waitForUser: <T>(gate: string) => Promise<T>;
      signal: AbortSignal;
      bus: import('./agent-bus.js').IAgentBus;
      runAgentLoop: typeof import('./agent-loop.js').runAgentLoop;
    },
  ) => Promise<void>;
}

// ─── Runtime Parameters ──────────────────────────────────────────────

/**
 * Parameters passed by the route layer to `runProductPipeline()`.
 * These are product-agnostic — every product needs session/user info,
 * an SSE emitter, and a gate handler.
 */
export interface RuntimeParams<TEvent extends BaseEvent = BaseEvent> {
  sessionId: string;
  userId: string;
  emit: (event: TEvent) => void;
  waitForUser: <T>(gate: string) => Promise<T>;
  signal?: AbortSignal;
  /** Product-specific input (e.g., raw resume text, job description) */
  input: Record<string, unknown>;
}

// ─── Product Configuration ───────────────────────────────────────────

/**
 * The main type contract for a product on the platform.
 *
 * A product defines:
 * - Its domain name
 * - The ordered sequence of agents
 * - How to initialize state from input
 * - How to build messages for each agent
 * - How to finalize results
 * - Optional: persistence, inter-agent handlers
 */
export interface ProductConfig<
  TState extends BaseState = BaseState,
  TEvent extends BaseEvent = BaseEvent,
> {
  /** Product domain name (e.g. 'resume', 'cover-letter') */
  domain: string;

  /** Ordered sequence of agent phases to execute */
  agents: AgentPhase<TState, TEvent>[];

  /**
   * Create the initial pipeline state from runtime input.
   * Called once at the start of the pipeline.
   */
  createInitialState: (
    sessionId: string,
    userId: string,
    input: Record<string, unknown>,
  ) => TState;

  /**
   * Build the initial message for a specific agent.
   * Called before each agent loop starts.
   * May return a Promise to support async data fetching (e.g. DB lookups for cross-product context).
   */
  buildAgentMessage: (
    agentName: string,
    state: TState,
    input: Record<string, unknown>,
  ) => string | Promise<string>;

  /**
   * Build the final result from the completed pipeline state.
   * Called after all agents have completed.
   * The return value is passed to `persistResult()` and emitted as the completion event.
   */
  finalizeResult: (
    state: TState,
    input: Record<string, unknown>,
    emit: (event: TEvent) => void,
  ) => unknown;

  /**
   * Optional: persist the final result to a database.
   * Called after `finalizeResult()` completes.
   */
  persistResult?: (
    state: TState,
    result: unknown,
    input: Record<string, unknown>,
  ) => Promise<void>;

  /**
   * Optional: inter-agent message handlers.
   * The generic coordinator subscribes these to the bus before each agent runs
   * and unsubscribes after the agent completes.
   */
  interAgentHandlers?: InterAgentHandler<TState, TEvent>[];

  /**
   * Optional: validate state after an agent completes.
   * Throw an error to abort the pipeline if critical data is missing.
   */
  validateAfterAgent?: (agentName: string, state: TState) => void;

  /**
   * Optional: emit error events in a product-specific format.
   * If not provided, the generic coordinator emits a basic error structure.
   */
  emitError?: (stage: string, error: string, emit: (event: TEvent) => void) => void;
}
