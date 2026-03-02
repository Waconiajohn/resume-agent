/**
 * Product Config Types — Compile-time verification test.
 *
 * Verifies that ProductConfig can be instantiated for both the resume product
 * and a hypothetical cover-letter product. These tests are primarily
 * type-system checks — if the file compiles, the types are correct.
 */

import { describe, it, expect } from 'vitest';
import type {
  ProductConfig,
  AgentPhase,
  GateDef,
  InterAgentHandler,
  RuntimeParams,
} from '../agents/runtime/product-config.js';
import type { AgentConfig, BaseState, BaseEvent } from '../agents/runtime/agent-protocol.js';

// ─── Resume product types (subset for testing) ──────────────────────

interface TestResumeState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  intake?: { name: string };
  architect?: { positioning_angle: string };
  sections?: Record<string, { content: string }>;
}

type TestResumeEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string }
  | { type: 'pipeline_complete'; session_id: string }
  | { type: 'pipeline_error'; stage: string; error: string }
  | { type: 'transparency'; stage: string; message: string };

// ─── Cover letter product types (hypothetical) ─────────────────────

interface TestCoverLetterState extends BaseState {
  session_id: string;
  user_id: string;
  current_stage: string;
  resume_data?: unknown;
  jd_analysis?: unknown;
  letter_draft?: string;
  quality_score?: number;
}

type TestCoverLetterEvent =
  | { type: 'stage_start'; stage: string; message: string }
  | { type: 'stage_complete'; stage: string; message: string }
  | { type: 'letter_complete'; session_id: string; letter: string }
  | { type: 'pipeline_error'; stage: string; error: string };

// ─── Mock agent configs ──────────────────────────────────────────────

function makeMockAgentConfig<
  TState extends BaseState,
  TEvent extends BaseEvent,
>(name: string, domain: string): AgentConfig<TState, TEvent> {
  return {
    identity: { name, domain },
    system_prompt: `You are the ${name} agent.`,
    tools: [],
    model: 'test-model',
    max_rounds: 5,
    round_timeout_ms: 30_000,
    overall_timeout_ms: 120_000,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ProductConfig type instantiation', () => {
  it('compiles for resume product', () => {
    const strategistConfig = makeMockAgentConfig<TestResumeState, TestResumeEvent>('strategist', 'resume');
    const craftsmanConfig = makeMockAgentConfig<TestResumeState, TestResumeEvent>('craftsman', 'resume');

    const blueprintGate: GateDef<TestResumeState> = {
      name: 'architect_review',
      condition: (state) => !!state.architect,
      onResponse: (response, state) => {
        if (typeof response === 'object' && response !== null) {
          const edits = (response as Record<string, unknown>).edits;
          if (edits && state.architect) {
            // Apply user edits
          }
        }
      },
    };

    const phases: AgentPhase<TestResumeState, TestResumeEvent>[] = [
      {
        name: 'strategist',
        config: strategistConfig,
        gates: [blueprintGate],
        stageMessage: { startStage: 'intake', start: 'Starting intelligence phase...', complete: 'Blueprint ready' },
      },
      {
        name: 'craftsman',
        config: craftsmanConfig,
        onComplete: (scratchpad, state) => {
          // Transfer sections from scratchpad to state
          for (const [key, val] of Object.entries(scratchpad)) {
            if (key.startsWith('section_') && val && typeof val === 'object') {
              if (!state.sections) state.sections = {};
              state.sections[key.replace('section_', '')] = val as { content: string };
            }
          }
        },
      },
    ];

    const config: ProductConfig<TestResumeState, TestResumeEvent> = {
      domain: 'resume',
      agents: phases,
      createInitialState: (sessionId, userId) => ({
        session_id: sessionId,
        user_id: userId,
        current_stage: 'intake',
      }),
      buildAgentMessage: (agentName, state) => {
        if (agentName === 'strategist') return 'Parse the resume...';
        if (agentName === 'craftsman') return `Blueprint: ${JSON.stringify(state.architect)}`;
        return '';
      },
      finalizeResult: (state, _input, emit) => {
        emit({ type: 'pipeline_complete', session_id: state.session_id });
        return { sections: state.sections };
      },
      persistResult: async (_state, _result) => {
        // Would persist to Supabase
      },
      validateAfterAgent: (agentName, state) => {
        if (agentName === 'strategist' && !state.intake) {
          throw new Error('Strategist did not produce intake data');
        }
      },
      emitError: (stage, error, emit) => {
        emit({ type: 'pipeline_error', stage, error });
      },
    };

    // Type check passes if this compiles
    expect(config.domain).toBe('resume');
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('strategist');
    expect(config.agents[0].gates).toHaveLength(1);
  });

  it('compiles for cover-letter product', () => {
    const analystConfig = makeMockAgentConfig<TestCoverLetterState, TestCoverLetterEvent>('analyst', 'cover-letter');
    const writerConfig = makeMockAgentConfig<TestCoverLetterState, TestCoverLetterEvent>('writer', 'cover-letter');

    const phases: AgentPhase<TestCoverLetterState, TestCoverLetterEvent>[] = [
      { name: 'analyst', config: analystConfig },
      { name: 'writer', config: writerConfig },
    ];

    const config: ProductConfig<TestCoverLetterState, TestCoverLetterEvent> = {
      domain: 'cover-letter',
      agents: phases,
      createInitialState: (sessionId, userId, input) => ({
        session_id: sessionId,
        user_id: userId,
        current_stage: 'analysis',
        resume_data: input.resume_text,
      }),
      buildAgentMessage: (agentName, state) => {
        if (agentName === 'analyst') return `Analyze: ${JSON.stringify(state.resume_data)}`;
        if (agentName === 'writer') return `Write letter from plan: ${JSON.stringify(state.jd_analysis)}`;
        return '';
      },
      finalizeResult: (state, _input, emit) => {
        emit({ type: 'letter_complete', session_id: state.session_id, letter: state.letter_draft ?? '' });
        return { letter: state.letter_draft, quality_score: state.quality_score };
      },
    };

    expect(config.domain).toBe('cover-letter');
    expect(config.agents).toHaveLength(2);
  });

  it('RuntimeParams type is correct', () => {
    const params: RuntimeParams<TestResumeEvent> = {
      sessionId: 'test-session',
      userId: 'test-user',
      emit: (_event: TestResumeEvent) => {},
      waitForUser: async <T>(_gate: string): Promise<T> => {
        return true as T;
      },
      input: { raw_resume_text: 'test', job_description: 'test' },
    };

    expect(params.sessionId).toBe('test-session');
  });

  it('InterAgentHandler type is correct', () => {
    const handler: InterAgentHandler<TestResumeState, TestResumeEvent> = {
      listenTo: 'craftsman',
      handler: async (msg, state, ctx) => {
        if (msg.type === 'request') {
          ctx.emit({ type: 'transparency', stage: state.current_stage, message: 'Handling revision...' });
        }
      },
    };

    expect(handler.listenTo).toBe('craftsman');
  });
});
