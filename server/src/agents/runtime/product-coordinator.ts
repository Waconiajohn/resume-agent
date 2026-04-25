/**
 * Product Coordinator — Generic pipeline runner for any product.
 *
 * Takes a ProductConfig and RuntimeParams, then executes the agent phases
 * in order: build message → runAgentLoop() → process scratchpad →
 * check gates → next agent.
 *
 * Handles: usage tracking, stage timing, cost calculation, abort controller,
 * bus setup, sequential agent execution, inter-agent handler subscription,
 * gate waiting, error handling.
 *
 * Domain-agnostic — all product-specific logic lives in ProductConfig.
 */

import {
  startUsageTracking,
  stopUsageTracking,
  setUsageTrackingContext,
} from '../../lib/llm-provider.js';
import { createSessionLogger } from '../../lib/logger.js';
import { MODEL_PRICING, MODEL_LIGHT, MODEL_MID, MODEL_PRIMARY } from '../../lib/llm.js';
import { captureErrorWithContext } from '../../lib/sentry.js';
import {
  recordPipelineCompletion,
  recordPipelineError,
  recordActiveUser,
} from '../../lib/pipeline-metrics.js';
import { runAgentLoop } from './agent-loop.js';
import type { IAgentBus } from './agent-bus.js';
import { getAgentBus } from './bus-factory.js';
import type { AgentMessage, BaseState, BaseEvent } from './agent-protocol.js';
import type { CreateContextParams } from './agent-context.js';
import type { ProductConfig, RuntimeParams, InterAgentHandler } from './product-config.js';

// ─── Stage timing helpers ─────────────────────────────────────────────

interface StageTimer {
  start(stage: string): void;
  end(stage: string): number;
  get(stage: string): number | undefined;
  all(): Record<string, number>;
}

function makeStageTimer(): StageTimer {
  const starts = new Map<string, number>();
  const timings: Record<string, number> = {};

  return {
    start(stage: string): void {
      starts.set(stage, Date.now());
    },
    end(stage: string): number {
      const t = starts.get(stage);
      if (t) {
        timings[stage] = Date.now() - t;
      }
      return timings[stage] ?? 0;
    },
    get(stage: string): number | undefined {
      return timings[stage];
    },
    all(): Record<string, number> {
      return { ...timings };
    },
  };
}

// ─── Cost calculation ─────────────────────────────────────────────────

/**
 * Estimate USD cost from accumulated token counts.
 * Uses a blended rate: 50% LIGHT, 30% MID, 20% PRIMARY.
 * Model constants resolve to the correct model strings for the active provider.
 */
function calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
  const lightPrice   = MODEL_PRICING[MODEL_LIGHT]   ?? { input: 0, output: 0 };
  const midPrice     = MODEL_PRICING[MODEL_MID]     ?? { input: 0, output: 0 };
  const primaryPrice = MODEL_PRICING[MODEL_PRIMARY] ?? { input: 0, output: 0 };

  const blendedInput  = lightPrice.input  * 0.5 + midPrice.input  * 0.3 + primaryPrice.input  * 0.2;
  const blendedOutput = lightPrice.output * 0.5 + midPrice.output * 0.3 + primaryPrice.output * 0.2;

  return Number(
    (
      (usage.input_tokens  / 1_000_000) * blendedInput +
      (usage.output_tokens / 1_000_000) * blendedOutput
    ).toFixed(4),
  );
}

// ─── Inter-agent handler subscription ─────────────────────────────────

function subscribeInterAgentHandlers<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(
  handlers: InterAgentHandler<TState, TEvent>[],
  bus: IAgentBus,
  state: TState,
  emit: (event: TEvent) => void,
  waitForUser: <T>(gate: string) => Promise<T>,
  signal: AbortSignal,
): () => void {
  const cleanupFns: Array<() => void> = [];

  for (const h of handlers) {
    const syncHandler = (msg: AgentMessage) => {
      void h.handler(msg, state, { emit, waitForUser, signal, bus, runAgentLoop });
    };
    bus.subscribe(h.listenTo, syncHandler);
    cleanupFns.push(() => bus.unsubscribe(h.listenTo));
  }

  return () => {
    for (const fn of cleanupFns) fn();
  };
}

// ─── Public API ───────────────────────────────────────────────────────

export interface ProductPipelineResult<TState extends BaseState = BaseState> {
  state: TState;
  usage: { input_tokens: number; output_tokens: number; estimated_cost_usd: number };
  stage_timings: Record<string, number>;
}

/**
 * Run a product pipeline from start to finish.
 *
 * Executes each agent phase in order, handling gates, inter-agent messaging,
 * usage tracking, and error recovery.
 */
export async function runProductPipeline<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(
  productConfig: ProductConfig<TState, TEvent>,
  params: RuntimeParams<TEvent>,
): Promise<ProductPipelineResult<TState>> {
  const { sessionId, userId, emit, waitForUser, input } = params;
  const log = createSessionLogger(sessionId);
  const pipelineStartTime = Date.now();

  // ── Usage tracking ──────────────────────────────────────────────
  const usageAcc = startUsageTracking(sessionId, userId);
  setUsageTrackingContext(sessionId);
  recordActiveUser(userId);

  // ── Initial pipeline state ──────────────────────────────────────
  const state = productConfig.createInitialState(sessionId, userId, input);

  // ── Shared abort controller ─────────────────────────────────────
  const pipelineAbort = new AbortController();
  if (params.signal) {
    // Forward external abort to pipeline abort
    params.signal.addEventListener('abort', () => pipelineAbort.abort(), { once: true });
  }

  // ── Stage timing ────────────────────────────────────────────────
  const timer = makeStageTimer();

  // ── Agent bus ───────────────────────────────────────────────────
  const bus = getAgentBus();

  try {
    // ── Execute each agent phase in order ──────────────────────────
    for (const phase of productConfig.agents) {
      log.info({ agent: phase.name, domain: productConfig.domain }, 'Product coordinator: starting agent');

      // Emit stage start if configured
      if (phase.stageMessage) {
        emit({
          type: 'stage_start',
          stage: phase.stageMessage.startStage,
          message: phase.stageMessage.start,
        } as unknown as TEvent);
      }

      timer.start(phase.name);

      // Subscribe inter-agent handlers (e.g. revision routing)
      let cleanupHandlers: (() => void) | undefined;
      if (productConfig.interAgentHandlers && productConfig.interAgentHandlers.length > 0) {
        cleanupHandlers = subscribeInterAgentHandlers(
          productConfig.interAgentHandlers,
          bus, state, emit, waitForUser, pipelineAbort.signal,
        );
      }

      // Build the agent context params
      const contextParams: CreateContextParams<TState, TEvent> = {
        sessionId,
        userId,
        state,
        emit,
        waitForUser,
        signal: pipelineAbort.signal,
        bus,
        identity: phase.config.identity,
      };

      // Build the initial message for this agent (may be async for cross-product DB lookups)
      const initialMessage = await productConfig.buildAgentMessage(phase.name, state, input);

      try {
        // Run the agent loop
        const result = await runAgentLoop({
          config: phase.config,
          contextParams,
          initialMessage,
        });

        log.info(
          { agent: phase.name, rounds: result.rounds_used, messages_out: result.messages_out.length },
          'Product coordinator: agent complete',
        );

        // Post-processing: transfer scratchpad data to state
        if (phase.onComplete) {
          phase.onComplete(result.scratchpad, state, emit);
        }
      } finally {
        // Always unsubscribe handlers even if the agent throws
        if (cleanupHandlers) cleanupHandlers();
      }

      // Validate state after agent completes
      if (productConfig.validateAfterAgent) {
        productConfig.validateAfterAgent(phase.name, state);
      }

      const duration = timer.end(phase.name);

      // Emit stage complete if configured
      if (phase.stageMessage) {
        emit({
          type: 'stage_complete',
          stage: phase.stageMessage.completeStage ?? phase.stageMessage.startStage,
          message: phase.stageMessage.complete,
          duration_ms: duration,
        } as unknown as TEvent);
      }

      // Process gates after agent completes
      if (phase.gates) {
        for (const gate of phase.gates) {
          const shouldFire = !gate.condition || gate.condition(state);
          if (shouldFire) {
            const maxGateReruns = gate.maxReruns ?? 3;
            let rerunCount = 0;

            // Gate loop: wait → onResponse → optionally re-run agent → re-fire gate
             
            while (true) {
              // C1: Abort check at top of every revision loop iteration to prevent
              // hanging after SSE disconnect during a revision loop.
              if (pipelineAbort.signal.aborted) break;

              log.info({ gate: gate.name, agent: phase.name, rerunCount }, 'Product coordinator: waiting at gate');
              const response = await waitForUser<unknown>(gate.name);
              if (gate.onResponse) {
                gate.onResponse(response, state, emit as (event: BaseEvent) => void);
              }

              // Check if agent needs to re-run (e.g., user provided feedback)
              if (gate.requiresRerun?.(state) && rerunCount < maxGateReruns) {
                rerunCount++;
                log.info(
                  { gate: gate.name, agent: phase.name, rerunCount },
                  'Product coordinator: re-running agent after gate feedback',
                );

                // Emit stage restart so frontend shows progress
                if (phase.stageMessage) {
                  emit({
                    type: 'stage_start',
                    stage: phase.stageMessage.startStage,
                    message: `Revising based on your feedback (attempt ${rerunCount})...`,
                  } as unknown as TEvent);
                }

                // Re-build message (now includes revision_feedback from onResponse)
                const revisionMessage = await productConfig.buildAgentMessage(phase.name, state, input);

                // Re-subscribe inter-agent handlers
                let revCleanup: (() => void) | undefined;
                if (productConfig.interAgentHandlers && productConfig.interAgentHandlers.length > 0) {
                  revCleanup = subscribeInterAgentHandlers(
                    productConfig.interAgentHandlers,
                    bus, state, emit, waitForUser, pipelineAbort.signal,
                  );
                }

                try {
                  const revResult = await runAgentLoop({
                    config: phase.config,
                    contextParams: {
                      ...contextParams,
                      state, // state already mutated by onResponse
                    },
                    initialMessage: revisionMessage,
                  });

                  log.info(
                    { agent: phase.name, rounds: revResult.rounds_used, rerunCount },
                    'Product coordinator: revision agent complete',
                  );

                  // Post-process scratchpad again
                  if (phase.onComplete) {
                    phase.onComplete(revResult.scratchpad, state, emit);
                  }
                } finally {
                  if (revCleanup) revCleanup();
                }

                // Loop back to re-fire the gate so user can review the revision
                continue;
              }

              // No re-run needed (approved or direct edit) — exit gate loop
              break;
            }

            log.info({ gate: gate.name, rerunCount }, 'Product coordinator: gate passed');
          }
        }
      }
    }

    // ── Finalize ───────────────────────────────────────────────────
    const result = productConfig.finalizeResult(state, input, emit);

    // Collect accumulated token usage
    const usage = {
      input_tokens: usageAcc.input_tokens,
      output_tokens: usageAcc.output_tokens,
      estimated_cost_usd: calculateCost(usageAcc),
    };

    stopUsageTracking(sessionId);

    // Persist result if configured
    if (productConfig.persistResult) {
      await productConfig.persistResult(state, result, input);
    }

    recordPipelineCompletion(
      productConfig.domain,
      Date.now() - pipelineStartTime,
      usage.estimated_cost_usd,
    );

    log.info(
      {
        domain: productConfig.domain,
        agents_completed: productConfig.agents.length,
        usage,
        stage_timings_ms: timer.all(),
      },
      'Product coordinator: pipeline complete',
    );

    return { state, usage, stage_timings: timer.all() };

  } catch (error) {
    pipelineAbort.abort();
    stopUsageTracking(sessionId);

    const errorMsg = error instanceof Error ? error.message : String(error);
    const currentStage = (state as Record<string, unknown>)['current_stage'] as string ?? 'unknown';
    recordPipelineError(productConfig.domain);
    captureErrorWithContext(error, {
      severity: 'P0',
      category: 'pipeline_error',
      sessionId,
      stage: currentStage,
      fingerprint: ['pipeline_error', productConfig.domain, currentStage],
    });
    log.error({ error: errorMsg, stage: currentStage, domain: productConfig.domain }, 'Product coordinator: pipeline error');

    // Emit error event
    if (productConfig.emitError) {
      productConfig.emitError(currentStage, errorMsg, emit);
    } else {
      emit({
        type: 'pipeline_error',
        stage: currentStage,
        error: errorMsg,
      } as unknown as TEvent);
    }

    throw error;
  }
}
