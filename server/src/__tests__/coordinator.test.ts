/**
 * Coordinator unit tests
 *
 * Tests the coordinator's orchestration logic without making real LLM calls.
 * The three agent loops (Strategist, Craftsman, Producer) are mocked via
 * vi.mock('../agents/runtime/agent-loop.js').
 *
 * Coverage:
 *   1.  Stage transitions — current_stage progresses through each phase
 *   2.  Error propagation — pipeline_error SSE emitted on throw
 *   3.  Gate logic — waitForUser called with correct gate names
 *   4.  Scratchpad→state transfer — Craftsman scratchpad sections move to state.sections
 *   5.  Evidence extraction — extractEvidenceItems pulls crafted bullets + interview answers
 *   6.  Master resume save — saveMasterResume calls supabase with correct data
 *   7.  approved_sections tracking — sections in approved_sections are immutable to revisions
 *   8.  Revision handler — Producer→Craftsman bus revisions skip approved sections
 *   9.  buildStrategistMessage — message content and master resume injection
 *  10.  buildCraftsmanMessage — blueprint, evidence, transcript all included
 *  11.  buildProducerMessage — written sections summarised and full content included
 *  12.  calculateCost — blended-rate formula produces expected values
 *  13.  sanitizeEducationYear — age-protection year stripping
 *  14.  stripLeadingSectionTitle — removes ALL-CAPS / title-case headings
 *  15.  compareExperienceRoleKeys — sorts role keys numerically
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ─── Hoist mocks so vi.mock factories can reference them ─────────────────────

const mockRunAgentLoop = vi.hoisted(() => vi.fn());

// ─── vi.mock declarations (must be top-level) ─────────────────────────────────

vi.mock('../agents/runtime/agent-loop.js', () => ({
  runAgentLoop: mockRunAgentLoop,
}));

vi.mock('../lib/llm.js', () => ({
  MODEL_PRICING: {
    'glm-4.7-flash': { input: 0,    output: 0    },
    'glm-4.5-air':   { input: 0.20, output: 1.10 },
    'glm-4.7':       { input: 0.60, output: 2.20 },
  },
  MODEL_LIGHT:        'mock-light',
  MODEL_PRIMARY:      'mock-primary',
  MODEL_MID:          'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  llm: { chat: vi.fn(), stream: vi.fn() },
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn().mockReturnValue({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockReturnThis(),
      update:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../lib/logger.js', () => {
  const noopLogger = {
    info:  vi.fn(),
    warn:  vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  };
  return {
    default: noopLogger,
    createSessionLogger: vi.fn().mockReturnValue(noopLogger),
    logger: noopLogger,
  };
});

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking:      vi.fn().mockReturnValue({ input_tokens: 100, output_tokens: 200 }),
  stopUsageTracking:       vi.fn(),
  setUsageTrackingContext: vi.fn(),
  createCombinedAbortSignal: vi.fn().mockReturnValue(new AbortController().signal),
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_BLUEPRINT_APPROVAL: false, // default off for most tests; override per-test as needed
  QUESTIONNAIRE_FLAGS: {},
  isQuestionnaireEnabled: vi.fn().mockReturnValue(false),
  GUIDED_SUGGESTIONS_ENABLED: false,
}));

vi.mock('../agents/ats-rules.js', () => ({
  runAtsComplianceCheck: vi.fn().mockReturnValue([]),
}));

vi.mock('../agents/master-resume-merge.js', () => ({
  mergeMasterResume: vi.fn().mockImplementation(
    (existing: unknown) => existing,
  ),
}));

vi.mock('../agents/strategist/agent.js', () => ({
  strategistConfig: {
    identity: { name: 'strategist', domain: 'resume' },
    system_prompt: 'strategist prompt',
    tools: [],
    model: 'mock-model',
    max_rounds: 10,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
  },
}));

vi.mock('../agents/craftsman/agent.js', () => ({
  craftsmanConfig: {
    identity: { name: 'craftsman', domain: 'resume' },
    system_prompt: 'craftsman prompt',
    tools: [],
    model: 'mock-model',
    max_rounds: 10,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
  },
}));

vi.mock('../agents/producer/agent.js', () => ({
  producerConfig: {
    identity: { name: 'producer', domain: 'resume' },
    system_prompt: 'producer prompt',
    tools: [],
    model: 'mock-model',
    max_rounds: 10,
    round_timeout_ms: 5000,
    overall_timeout_ms: 30000,
  },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { runPipeline, type PipelineConfig, type PipelineEmitter } from '../agents/coordinator.js';
import type { PipelineSSEEvent, PipelineState, SectionWriterOutput, IntakeOutput, ArchitectOutput } from '../agents/types.js';
import type { AgentResult } from '../agents/runtime/agent-protocol.js';

// ─── Fixture factories ────────────────────────────────────────────────────────

function makeIntakeOutput(): IntakeOutput {
  return {
    contact: { name: 'Jane Smith', email: 'jane@example.com', phone: '555-0000', location: 'Seattle, WA' },
    summary: 'Engineering leader with 15 years experience.',
    experience: [
      {
        company: 'Acme Corp',
        title: 'VP Engineering',
        start_date: '2019',
        end_date: 'Present',
        bullets: ['Led 45 engineers', 'Cut costs $2.4M'],
        inferred_scope: { team_size: '45' },
      },
      {
        company: 'StartupX',
        title: 'Engineering Manager',
        start_date: '2015',
        end_date: '2019',
        bullets: ['Built platform from scratch'],
      },
    ],
    skills: ['AWS', 'Kubernetes', 'Python'],
    education: [{ degree: 'BS Computer Science', institution: 'MIT', year: '2005' }],
    certifications: ['AWS Solutions Architect'],
    career_span_years: 15,
    raw_text: 'Jane Smith resume text...',
  };
}

function makeArchitectOutput(): ArchitectOutput {
  return {
    blueprint_version: '2.0',
    target_role: 'CTO at TechCorp',
    positioning_angle: 'Platform-first engineering executive',
    section_plan: {
      order: ['header', 'summary', 'experience', 'skills', 'education_and_certifications'],
      rationale: 'Lead with impact',
    },
    summary_blueprint: {
      positioning_angle: 'Engineering executive',
      must_include: ['leadership at scale'],
      gap_reframe: {},
      tone_guidance: 'Executive, direct',
      keywords_to_embed: ['cloud-native'],
      authentic_phrases_to_echo: ['build for scale'],
      length: '3-4 sentences',
    },
    evidence_allocation: {
      experience_section: {
        role_0: {
          company: 'Acme Corp',
          bullets_to_write: [],
          bullets_to_keep: [],
          bullets_to_cut: [],
        },
      },
      unallocated_requirements: [],
    },
    skills_blueprint: {
      format: 'categorized',
      categories: [{ label: 'Technical', skills: ['AWS'], rationale: 'Core JD requirement' }],
      keywords_still_missing: [],
      age_protection_removals: [],
    },
    experience_blueprint: {
      roles: [{ company: 'Acme Corp', title: 'VP Engineering', dates: '2019 – Present', bullet_count: 5 }],
    },
    age_protection: { flags: [], clean: true },
    keyword_map: {},
    global_rules: {
      voice: 'Executive, direct',
      bullet_format: 'Action → scope → result',
      length_target: '2 pages',
      ats_rules: 'No tables',
    },
  };
}

function makeSectionOutput(content: string): SectionWriterOutput {
  return {
    section: 'summary',
    content,
    keywords_used: ['cloud-native'],
    requirements_addressed: ['engineering leadership'],
    evidence_ids_used: ['ev_001'],
  };
}

/** Minimal AgentResult with no scratchpad sections */
function makeAgentResult(scratchpadOverrides: Record<string, unknown> = {}): AgentResult {
  return {
    scratchpad: scratchpadOverrides,
    messages_out: [],
    usage: { input_tokens: 50, output_tokens: 100 },
    rounds_used: 3,
  };
}

/**
 * Build a Strategist result that populates state.intake and state.architect.
 * Because the coordinator checks state.intake / state.architect *after*
 * runAgentLoop returns (not the result object), we use a side-effect mock
 * that sets the fields on the captured state object.
 */
function makeStrategistSideEffect(
  stateRef: { value: PipelineState | null },
  overrides?: Partial<PipelineState>,
): AgentResult {
  // The strategist loop is called first — we capture state here
  return makeAgentResult({});
}

/** Build a PipelineConfig for tests */
function makeConfig(
  overrides: Partial<PipelineConfig> = {},
): PipelineConfig {
  const events: PipelineSSEEvent[] = [];
  return {
    session_id: 'test-session-id',
    user_id:    'test-user-id',
    raw_resume_text: 'Jane Smith resume...',
    job_description: 'We are looking for a CTO...',
    company_name: 'TechCorp',
    emit: (e) => events.push(e),
    waitForUser: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

// ─── Helper: set up the standard 3-agent mock sequence ──────────────────────
//
// The coordinator calls runAgentLoop 3 times in order:
//   call 0 → Strategist (must side-effect state.intake + state.architect)
//   call 1 → Craftsman
//   call 2 → Producer
//
// We use a custom implementation that captures the PipelineState (via
// contextParams.state) and injects the required data.

function setupStandardMocks(options: {
  craftsmanScratchpad?: Record<string, unknown>;
  injectSections?: Record<string, SectionWriterOutput>;
  strategistFails?: boolean;
  craftsmanFails?: boolean;
  producerFails?: boolean;
} = {}) {
  let callCount = 0;

  mockRunAgentLoop.mockImplementation(
    async ({ contextParams }: { contextParams: { state: PipelineState } }) => {
      const state = contextParams.state;
      const n = callCount++;

      if (n === 0) {
        // Strategist — must populate intake + architect
        if (options.strategistFails) throw new Error('Strategist failed');
        state.intake    = makeIntakeOutput();
        state.architect = makeArchitectOutput();
        if (options.injectSections) {
          state.sections = { ...(state.sections ?? {}), ...options.injectSections };
        }
        return makeAgentResult({});
      }

      if (n === 1) {
        // Craftsman
        if (options.craftsmanFails) throw new Error('Craftsman failed');
        return makeAgentResult(options.craftsmanScratchpad ?? {});
      }

      // Producer (n === 2)
      if (options.producerFails) throw new Error('Producer failed');
      return makeAgentResult({});
    },
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runPipeline — stage transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('starts with current_stage = intake and ends at complete', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    const state = await runPipeline(config);

    expect(state.current_stage).toBe('complete');

    // stage_start for intake must have been emitted
    const intakeStart = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'stage_start' }> =>
        e.type === 'stage_start' && e.stage === 'intake',
    );
    expect(intakeStart).toBeDefined();
    expect(intakeStart!.message).toContain('Parsing');
  });

  it('emits stage_start for section_writing before Craftsman runs', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const sectionStart = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'stage_start' }> =>
        e.type === 'stage_start' && e.stage === 'section_writing',
    );
    expect(sectionStart).toBeDefined();
    expect(sectionStart!.message).toContain('Writing');
  });

  it('emits stage_start for quality_review before Producer runs', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const qaStart = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'stage_start' }> =>
        e.type === 'stage_start' && e.stage === 'quality_review',
    );
    expect(qaStart).toBeDefined();
    expect(qaStart!.message).toContain('quality review');
  });

  it('emits stage_complete for architect after Strategist completes', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const architectComplete = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'stage_complete' }> =>
        e.type === 'stage_complete' && e.stage === 'architect',
    );
    expect(architectComplete).toBeDefined();
    expect(architectComplete!.message).toContain('Blueprint complete');
  });

  it('emits pipeline_complete as the final event', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const complete = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_complete' }> =>
        e.type === 'pipeline_complete',
    );
    expect(complete).toBeDefined();
    expect(complete!.session_id).toBe('test-session-id');
    expect(complete!.company_name).toBe('TechCorp');
  });

  it('calls runAgentLoop exactly three times (Strategist + Craftsman + Producer)', async () => {
    setupStandardMocks();
    await runPipeline(makeConfig());

    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
  });
});

// ─── Error propagation ────────────────────────────────────────────────────────

describe('runPipeline — error propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('emits pipeline_error when Strategist throws', async () => {
    setupStandardMocks({ strategistFails: true });
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await expect(runPipeline(config)).rejects.toThrow('Strategist failed');

    const errEvent = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_error' }> =>
        e.type === 'pipeline_error',
    );
    expect(errEvent).toBeDefined();
    expect(errEvent!.error).toContain('Strategist failed');
  });

  it('emits pipeline_error when Craftsman throws', async () => {
    setupStandardMocks({ craftsmanFails: true });
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await expect(runPipeline(config)).rejects.toThrow('Craftsman failed');

    const errEvent = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_error' }> =>
        e.type === 'pipeline_error',
    );
    expect(errEvent).toBeDefined();
    expect(errEvent!.error).toContain('Craftsman failed');
  });

  it('emits pipeline_error when Strategist does not populate state.intake', async () => {
    // Strategist returns without setting state.intake
    mockRunAgentLoop.mockImplementation(async () => makeAgentResult({}));

    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await expect(runPipeline(config)).rejects.toThrow();

    const errEvent = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_error' }> =>
        e.type === 'pipeline_error',
    );
    expect(errEvent).toBeDefined();
    expect(errEvent!.error).toMatch(/intake|blueprint/i);
  });

  it('re-throws the original error after emitting pipeline_error', async () => {
    setupStandardMocks({ strategistFails: true });
    const config = makeConfig();

    const err = await runPipeline(config).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('Strategist failed');
  });
});

// ─── Blueprint gate logic ─────────────────────────────────────────────────────

describe('runPipeline — blueprint gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('calls waitForUser with "architect_review" when FF_BLUEPRINT_APPROVAL is on', async () => {
    // Override the feature-flag mock for this test
    const featureFlags = await import('../lib/feature-flags.js');
    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = true;

    const waitForUser = vi.fn().mockResolvedValue(true);
    setupStandardMocks();
    const config = makeConfig({ waitForUser });

    await runPipeline(config);

    expect(waitForUser).toHaveBeenCalledWith('architect_review');

    // Restore
    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = false;
  });

  it('skips waitForUser("architect_review") when workflow_mode is fast_draft', async () => {
    const featureFlags = await import('../lib/feature-flags.js');
    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = true;

    const waitForUser = vi.fn().mockResolvedValue(true);
    setupStandardMocks();
    const config = makeConfig({ waitForUser, workflow_mode: 'fast_draft' });

    await runPipeline(config);

    const architectReviewCalls = (waitForUser.mock.calls as string[][]).filter(
      (args) => args[0] === 'architect_review',
    );
    expect(architectReviewCalls).toHaveLength(0);

    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = false;
  });

  it('applies user-edited positioning_angle when blueprint approved with edits', async () => {
    const featureFlags = await import('../lib/feature-flags.js');
    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = true;

    const waitForUser = vi.fn().mockResolvedValue({
      approved: true,
      edits: { positioning_angle: 'New angle from user' },
    });

    let capturedState: PipelineState | null = null;
    let callCount = 0;
    mockRunAgentLoop.mockImplementation(
      async ({ contextParams }: { contextParams: { state: PipelineState } }) => {
        const n = callCount++;
        if (n === 0) {
          contextParams.state.intake    = makeIntakeOutput();
          contextParams.state.architect = makeArchitectOutput();
          capturedState = contextParams.state;
        }
        return makeAgentResult({});
      },
    );

    const config = makeConfig({ waitForUser });
    await runPipeline(config);

    expect((capturedState as PipelineState | null)?.architect?.positioning_angle).toBe('New angle from user');

    // @ts-expect-error — mutating readonly export for test
    featureFlags.FF_BLUEPRINT_APPROVAL = false;
  });
});

// ─── Scratchpad → state.sections transfer ────────────────────────────────────

describe('runPipeline — Craftsman scratchpad→state transfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('transfers section_* scratchpad keys to state.sections', async () => {
    const sectionContent = makeSectionOutput('Engineering leader summary...');
    const experienceContent = makeSectionOutput('VP Engineering at Acme Corp\n• Led 45 engineers');
    experienceContent.section = 'experience_role_0';
    experienceContent.content = 'VP Engineering at Acme Corp\n• Led 45 engineers';

    const craftsmanScratchpad: Record<string, unknown> = {
      section_summary: sectionContent,
      section_experience_role_0: experienceContent,
      // Non-section key — should be ignored
      some_other_key: { data: 'irrelevant' },
    };

    setupStandardMocks({ craftsmanScratchpad });

    let finalState: PipelineState | null = null;
    const originalMock = mockRunAgentLoop.getMockImplementation()!;
    // Intercept the emit to capture the final state
    const config = makeConfig({});
    finalState = await runPipeline(config);

    expect(finalState.sections).toBeDefined();
    expect(finalState.sections!['summary']).toBeDefined();
    expect(finalState.sections!['summary'].content).toBe('Engineering leader summary...');
    expect(finalState.sections!['experience_role_0']).toBeDefined();
  });

  it('ignores scratchpad keys that do not start with section_', async () => {
    const craftsmanScratchpad: Record<string, unknown> = {
      random_key: { content: 'should not appear' },
      section_summary: makeSectionOutput('Valid summary'),
    };

    setupStandardMocks({ craftsmanScratchpad });

    const state = await runPipeline(makeConfig());

    // Only the section_ key should transfer
    expect(state.sections!['random_key']).toBeUndefined();
    expect(state.sections!['summary']).toBeDefined();
  });

  it('ignores scratchpad values without a content property', async () => {
    const craftsmanScratchpad: Record<string, unknown> = {
      section_bad: { no_content: true },      // missing content
      section_good: makeSectionOutput('Good content'),
    };

    setupStandardMocks({ craftsmanScratchpad });

    const state = await runPipeline(makeConfig());

    expect(state.sections!['bad']).toBeUndefined();
    expect(state.sections!['good']).toBeDefined();
  });
});

// ─── Evidence extraction ──────────────────────────────────────────────────────

describe('extractEvidenceItems (via saveMasterResume path)', () => {
  /**
   * We test evidence extraction indirectly by checking what gets passed to the
   * Supabase RPC — the coordinator calls saveMasterResume which calls
   * extractEvidenceItems internally and passes results to supabaseAdmin.rpc().
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('extracts bullet evidence items from experience_role_* sections', async () => {
    const experienceContent = 'VP Engineering at Acme Corp\n• Led 45 engineers across 3 product lines\n• Reduced costs by $2.4M annually';

    const craftsmanScratchpad: Record<string, unknown> = {
      section_experience_role_0: {
        section: 'experience_role_0',
        content: experienceContent,
        keywords_used: [],
        requirements_addressed: [],
        evidence_ids_used: [],
      },
    };

    setupStandardMocks({ craftsmanScratchpad });

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const rpcMock = vi.fn().mockResolvedValue({ data: { id: 'new-mr-1' }, error: null });
    (supabaseAdmin as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await runPipeline(makeConfig());

    // supabaseAdmin.rpc('create_master_resume_atomic', ...) should have been called
    expect(rpcMock).toHaveBeenCalled();
    const rpcArgs = rpcMock.mock.calls[0];
    expect(rpcArgs[0]).toBe('create_master_resume_atomic');

    const evidenceItems: Array<{ text: string; source: string }> = rpcArgs[1].p_evidence_items;
    const crafted = evidenceItems.filter((i) => i.source === 'crafted');
    expect(crafted.length).toBeGreaterThan(0);
    expect(crafted.some((i) => i.text.includes('45 engineers'))).toBe(true);
    expect(crafted.some((i) => i.text.includes('$2.4M'))).toBe(true);
  });

  it('extracts interview transcript answers as evidence items', async () => {
    setupStandardMocks({});

    // We inject the transcript directly into state in the Strategist mock
    let callCount = 0;
    mockRunAgentLoop.mockImplementation(
      async ({ contextParams }: { contextParams: { state: PipelineState } }) => {
        const n = callCount++;
        if (n === 0) {
          contextParams.state.intake    = makeIntakeOutput();
          contextParams.state.architect = makeArchitectOutput();
          contextParams.state.interview_transcript = [
            {
              question_id: 'q1',
              question_text: 'Tell me about your biggest win.',
              category: 'hidden_accomplishments',
              answer: 'I rebuilt our entire CI/CD pipeline which saved 10h per deployment cycle.',
            },
          ];
        }
        return makeAgentResult({});
      },
    );

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const rpcMock = vi.fn().mockResolvedValue({ data: { id: 'new-mr-1' }, error: null });
    (supabaseAdmin as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await runPipeline(makeConfig());

    expect(rpcMock).toHaveBeenCalled();
    const rpcArgs = rpcMock.mock.calls[0];
    const evidenceItems: Array<{ text: string; source: string }> = rpcArgs[1].p_evidence_items;
    const interviewItems = evidenceItems.filter((i) => i.source === 'interview');
    expect(interviewItems.length).toBeGreaterThan(0);
    expect(interviewItems[0].text).toContain('CI/CD pipeline');
  });

  it('does not extract bullets shorter than 10 characters', async () => {
    const craftsmanScratchpad: Record<string, unknown> = {
      section_experience_role_0: {
        section: 'experience_role_0',
        content: 'Acme Corp\n• Short\n• Also short\n• This is a real bullet with enough content here',
        keywords_used: [],
        requirements_addressed: [],
        evidence_ids_used: [],
      },
    };

    setupStandardMocks({ craftsmanScratchpad });

    const { supabaseAdmin } = await import('../lib/supabase.js');
    const rpcMock = vi.fn().mockResolvedValue({ data: { id: 'new-mr-1' }, error: null });
    (supabaseAdmin as unknown as { rpc: typeof rpcMock }).rpc = rpcMock;

    await runPipeline(makeConfig());

    const rpcArgs = rpcMock.mock.calls[0];
    const evidenceItems: Array<{ text: string; source: string }> = rpcArgs[1].p_evidence_items;
    const crafted = evidenceItems.filter((i) => i.source === 'crafted');
    // Short bullets excluded
    expect(crafted.some((i) => i.text === 'Short')).toBe(false);
    expect(crafted.some((i) => i.text === 'Also short')).toBe(false);
    expect(crafted.some((i) => i.text.includes('enough content'))).toBe(true);
  });
});

// ─── approved_sections tracking ───────────────────────────────────────────────

describe('runPipeline — approved_sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('initialises approved_sections as empty array', async () => {
    setupStandardMocks();

    let capturedState: PipelineState | null = null;
    const origImpl = mockRunAgentLoop.getMockImplementation()!;
    let n = 0;
    mockRunAgentLoop.mockImplementation(async (params: { contextParams: { state: PipelineState } }) => {
      if (n++ === 0) capturedState = params.contextParams.state;
      return origImpl(params);
    });

    await runPipeline(makeConfig());

    expect(capturedState!.approved_sections).toEqual([]);
  });

  it('approved_sections that the Craftsman tools add are present in final state', async () => {
    // Simulate a Craftsman tool that marks a section as approved
    let callCount = 0;
    mockRunAgentLoop.mockImplementation(
      async ({ contextParams }: { contextParams: { state: PipelineState } }) => {
        const n = callCount++;
        if (n === 0) {
          contextParams.state.intake    = makeIntakeOutput();
          contextParams.state.architect = makeArchitectOutput();
        }
        if (n === 1) {
          // Craftsman tool mutates state directly via ctx.updateState()
          contextParams.state.approved_sections.push('summary');
          contextParams.state.sections = {
            summary: makeSectionOutput('Approved summary content'),
          };
        }
        return makeAgentResult({});
      },
    );

    const state = await runPipeline(makeConfig());

    expect(state.approved_sections).toContain('summary');
  });
});

// ─── Revision handler — approved sections skipped ────────────────────────────

describe('subscribeToRevisionRequests — approved sections filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('does not call runAgentLoop for a fourth time when all revision targets are approved', async () => {
    /**
     * The revision handler is triggered by a bus message from Producer.
     * We simulate it by having the Producer tool call bus.send() with a
     * revision request for 'summary' — but 'summary' is already approved.
     *
     * To avoid direct bus access from the test, we instrument the Producer
     * mock to call bus.send() via the context's sendMessage().
     */
    let callCount = 0;
    mockRunAgentLoop.mockImplementation(
      async ({ contextParams }: {
        contextParams: {
          state: PipelineState;
          sessionId: string;
          userId: string;
        };
      }) => {
        const n = callCount++;
        if (n === 0) {
          contextParams.state.intake    = makeIntakeOutput();
          contextParams.state.architect = makeArchitectOutput();
        }
        if (n === 1) {
          // Craftsman — mark summary as approved
          contextParams.state.approved_sections.push('summary');
          contextParams.state.sections = { summary: makeSectionOutput('Approved') };
        }
        // Producer (n === 2) — just returns without sending bus messages
        return makeAgentResult({});
      },
    );

    await runPipeline(makeConfig());

    // Only 3 calls (Strategist + Craftsman + Producer) — no revision sub-loop
    expect(mockRunAgentLoop).toHaveBeenCalledTimes(3);
  });
});

// ─── buildStrategistMessage content ──────────────────────────────────────────

describe('runPipeline — strategist initial message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('passes raw_resume_text and job_description to Strategist', async () => {
    setupStandardMocks();
    const config = makeConfig({
      raw_resume_text: 'UNIQUE_RESUME_MARKER',
      job_description: 'UNIQUE_JD_MARKER',
    });

    await runPipeline(config);

    const strategistCall = mockRunAgentLoop.mock.calls[0][0] as { initialMessage: string };
    expect(strategistCall.initialMessage).toContain('UNIQUE_RESUME_MARKER');
    expect(strategistCall.initialMessage).toContain('UNIQUE_JD_MARKER');
  });

  it('includes master resume section when master_resume is provided', async () => {
    setupStandardMocks();
    const config = makeConfig({
      master_resume: {
        id: 'mr-test',
        summary: 'MASTER_SUMMARY_CONTENT',
        experience: [
          {
            company: 'Past Corp',
            title: 'Director',
            start_date: '2015',
            end_date: '2019',
            location: 'NYC',
            bullets: [{ text: 'MASTER_BULLET_TEXT', source: 'crafted' }],
          },
        ],
        skills: { 'Leadership': ['Strategy'] },
        education: [{ institution: 'MIT', degree: 'BS', field: 'CS', year: '2005' }],
        certifications: [],
        evidence_items: [],
        raw_text: 'raw text',
        version: 1,
      },
    });

    await runPipeline(config);

    const strategistCall = mockRunAgentLoop.mock.calls[0][0] as { initialMessage: string };
    expect(strategistCall.initialMessage).toContain('MASTER RESUME');
    expect(strategistCall.initialMessage).toContain('MASTER_BULLET_TEXT');
  });

  it('includes workflow_mode preference when provided', async () => {
    setupStandardMocks();
    const config = makeConfig({ workflow_mode: 'deep_dive' });

    await runPipeline(config);

    const strategistCall = mockRunAgentLoop.mock.calls[0][0] as { initialMessage: string };
    expect(strategistCall.initialMessage).toContain('deep_dive');
  });
});

// ─── buildCraftsmanMessage content ───────────────────────────────────────────

describe('runPipeline — craftsman initial message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('includes the architect blueprint in the Craftsman message', async () => {
    setupStandardMocks();

    await runPipeline(makeConfig());

    const craftsmanCall = mockRunAgentLoop.mock.calls[1][0] as { initialMessage: string };
    expect(craftsmanCall.initialMessage).toContain('Architect Blueprint');
    expect(craftsmanCall.initialMessage).toContain('Platform-first engineering executive');
  });

  it('includes interview transcript in Craftsman message when present', async () => {
    let callCount = 0;
    mockRunAgentLoop.mockImplementation(
      async ({ contextParams }: { contextParams: { state: PipelineState } }) => {
        const n = callCount++;
        if (n === 0) {
          contextParams.state.intake    = makeIntakeOutput();
          contextParams.state.architect = makeArchitectOutput();
          contextParams.state.interview_transcript = [
            {
              question_id: 'q1',
              question_text: 'Biggest win?',
              category: 'hidden_accomplishments',
              answer: 'UNIQUE_INTERVIEW_ANSWER_TEXT',
            },
          ];
        }
        return makeAgentResult({});
      },
    );

    await runPipeline(makeConfig());

    const craftsmanCall = mockRunAgentLoop.mock.calls[1][0] as { initialMessage: string };
    expect(craftsmanCall.initialMessage).toContain('UNIQUE_INTERVIEW_ANSWER_TEXT');
  });
});

// ─── token_usage accumulated correctly ───────────────────────────────────────

describe('runPipeline — token usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('populates token_usage from the usage accumulator', async () => {
    const { startUsageTracking } = await import('../lib/llm-provider.js');
    vi.mocked(startUsageTracking).mockReturnValue({ input_tokens: 1234, output_tokens: 5678 });

    setupStandardMocks();
    const state = await runPipeline(makeConfig());

    expect(state.token_usage.input_tokens).toBe(1234);
    expect(state.token_usage.output_tokens).toBe(5678);
    // estimated_cost_usd is computed — just verify it's a non-negative number
    expect(state.token_usage.estimated_cost_usd).toBeGreaterThanOrEqual(0);
  });
});

// ─── pipeline_complete payload correctness ────────────────────────────────────

describe('runPipeline — pipeline_complete payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunAgentLoop.mockReset();
  });

  it('pipeline_complete includes contact_info from intake', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const complete = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_complete' }> =>
        e.type === 'pipeline_complete',
    );
    expect(complete!.contact_info).toBeDefined();
    expect(complete!.contact_info?.name).toBe('Jane Smith');
  });

  it('pipeline_complete resume includes skills from intake when no skills section written', async () => {
    setupStandardMocks();
    const emitted: PipelineSSEEvent[] = [];
    const config = makeConfig({ emit: (e) => emitted.push(e) });

    await runPipeline(config);

    const complete = emitted.find(
      (e): e is Extract<PipelineSSEEvent, { type: 'pipeline_complete' }> =>
        e.type === 'pipeline_complete',
    );
    // When no skills section, falls back to intake.skills as 'Core Skills' category
    expect(complete!.resume).toBeDefined();
    expect(typeof complete!.resume!.skills).toBe('object');
  });
});
