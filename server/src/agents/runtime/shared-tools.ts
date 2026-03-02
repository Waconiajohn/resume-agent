/**
 * Shared Tools — Reusable tool factories for the multi-agent system.
 *
 * These factories produce AgentTool instances that are domain-agnostic.
 * Each factory accepts optional configuration to allow per-agent customization
 * (e.g., a message prefix) while keeping behavior consistent across agents.
 *
 * Usage (in each agent's tools.ts):
 * ```ts
 * import { createEmitTransparency } from '../runtime/shared-tools.js';
 * import type { PipelineState, PipelineSSEEvent } from '../types.js';
 *
 * const emitTransparencyTool = createEmitTransparency<PipelineState, PipelineSSEEvent>();
 * // Producer variant:
 * const emitTransparencyTool = createEmitTransparency<PipelineState, PipelineSSEEvent>({ prefix: 'Producer: ' });
 * ```
 */

import type { AgentTool, BaseState, BaseEvent, AgentContext } from './agent-protocol.js';

// ─── emit_transparency factory ────────────────────────────────────────

/**
 * Configuration for the emit_transparency tool factory.
 */
export interface EmitTransparencyConfig {
  /**
   * Optional prefix added to every outgoing message.
   * Example: `"Producer: "` causes `"Reviewing ATS compliance..."` to be
   * emitted as `"Producer: Reviewing ATS compliance..."`.
   */
  prefix?: string;
}

/**
 * Create an `emit_transparency` tool for any agent.
 *
 * Domain-agnostic: works with any state/event types that expose a `current_stage`
 * field on state and accept a `{ type: 'transparency', message, stage }` event.
 *
 * Returns `{ success: false, reason }` on empty input (guard against LLM no-ops).
 * Returns `{ emitted: true, message }` on success.
 */
export function createEmitTransparency<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(config?: EmitTransparencyConfig): AgentTool<TState, TEvent> {
  const prefix = config?.prefix ?? '';

  return {
    name: 'emit_transparency',
    description:
      'Emit a transparency SSE event to inform the user what the agent is currently doing. ' +
      'Call this before starting major operations so the user sees live progress.',
    input_schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Human-readable status message describing the current action.',
        },
      },
      required: ['message'],
    },
    model_tier: 'orchestrator',
    async execute(
      input: Record<string, unknown>,
      ctx: AgentContext<TState, TEvent>,
    ): Promise<unknown> {
      const raw = String(input.message ?? '');
      if (!raw.trim()) {
        return { success: false, reason: 'message is empty' };
      }

      const message = prefix ? `${prefix}${raw}` : raw;

      // Cast to Record to read current_stage without constraining TState shape.
      const state = ctx.getState() as Record<string, unknown>;

      ctx.emit({
        type: 'transparency',
        message,
        stage: state['current_stage'],
      } as unknown as TEvent);

      return { emitted: true, message };
    },
  };
}
