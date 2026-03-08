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
import { MODEL_PRICING } from '../../lib/llm.js';
import { captureErrorWithContext } from '../../lib/sentry.js';
import {
  recordPipelineCompletion,
  recordPipelineError,
  recordActiveUser,
} from '../../lib/pipeline-metrics.js';
import { runAgentLoop } from './agent-loop.js';
import { AgentBus } from './agent-bus.js';
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
 * Uses a blended rate: 50% LIGHT (free), 30% MID, 20% PRIMARY.
 */
function calculateCost(usage: { input_tokens: number; output_tokens: number }): number {
  const lightPrice   = MODEL_PRICING['glm-4.7-flash']  ?? { input: 0,    output: 0    };
  const midPrice     = MODEL_PRICING['glm-4.5-air']    ?? { input: 0.20, output: 1.10 };
  const primaryPrice = MODEL_PRICING['glm-4.7']        ?? { input: 0.60, output: 2.20 };

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
  bus: AgentBus,
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
  const bus = new AgentBus();

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

      // Build the initial message for this agent
      const initialMessage = productConfig.buildAgentMessage(phase.name, state, input);

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
            log.info({ gate: gate.name, agent: phase.name }, 'Product coordinator: waiting at gate');
            const response = await waitForUser<unknown>(gate.name);
            if (gate.onResponse) {
              gate.onResponse(response, state, emit as (event: BaseEvent) => void);
            }
            log.info({ gate: gate.name }, 'Product coordinator: gate passed');
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
