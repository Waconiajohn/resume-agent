/**
 * Pipeline Coordinator (v4)
 *
 * Thin wrapper around the generic product coordinator.
 * Delegates to runProductPipeline() with the resume ProductConfig.
 *
 * Preserves the same public API (runPipeline, PipelineConfig, PipelineEmitter,
 * WaitForUser) so routes/pipeline.ts requires zero changes.
 */

// Import agent modules to trigger self-registration with agentRegistry
import './strategist/agent.js';
import './craftsman/agent.js';
import './producer/agent.js';

import { runProductPipeline } from './runtime/product-coordinator.js';
import { createResumeProductConfig } from './resume/product.js';
import type { PipelineState, PipelineSSEEvent } from './types.js';

// ─── Re-export public types from resume product ─────────────────────

export type { PipelineEmitter, WaitForUser, PipelineConfig } from './resume/product.js';

// ─── Re-import PipelineConfig for runtime use ────────────────────────

import type { PipelineConfig } from './resume/product.js';

// ─── Main coordinator ─────────────────────────────────────────────────

/**
 * Run the full 3-agent resume pipeline from start to finish.
 *
 * Stages:
 *   Strategist → [Blueprint Gate] → Craftsman → Producer
 *
 * This function is the public API called by routes/pipeline.ts.
 * Internally delegates to the generic runProductPipeline() with
 * a resume-specific ProductConfig.
 */
export async function runPipeline(config: PipelineConfig): Promise<PipelineState> {
  // Build the input record from PipelineConfig (the generic coordinator expects Record<string, unknown>)
  const input: Record<string, unknown> = { ...config };

  const resumeProductConfig = createResumeProductConfig(input);

  const result = await runProductPipeline<PipelineState, PipelineSSEEvent>(
    resumeProductConfig,
    {
      sessionId: config.session_id,
      userId: config.user_id,
      emit: config.emit,
      waitForUser: config.waitForUser,
      input,
    },
  );

  // Copy usage back into state for backward compatibility with pipeline.ts
  result.state.token_usage = {
    input_tokens: result.usage.input_tokens,
    output_tokens: result.usage.output_tokens,
    estimated_cost_usd: result.usage.estimated_cost_usd,
  };

  return result.state;
}
