/**
 * Craftsman Agent — Tool Unit Tests
 *
 * Covers: write_section, self_review_section, revise_section,
 *         check_keyword_coverage, check_anti_patterns, check_evidence_integrity,
 *         present_to_user, emit_transparency
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Module mocks ─────────────────────────────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../agents/section-writer.js', () => ({
  runSectionWriter: vi.fn(),
  runSectionRevision: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────

import { runSectionWriter, runSectionRevision } from '../agents/section-writer.js';
import { craftsmanTools } from '../agents/craftsman/tools.js';
import type { PipelineState, SectionWriterOutput, ResumeAgentContext } from '../agents/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makePipelineState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'section_writing',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    ...overrides,
  };
}

function makeCtx(stateOverrides?: Partial<PipelineState>): ResumeAgentContext & {
  emitSpy: ReturnType<typeof vi.fn>;
} {
  let state = makePipelineState(stateOverrides);
  const emitSpy = vi.fn();

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad: {},
    signal: new AbortController().signal,
    emit: emitSpy,
    waitForUser: vi.fn().mockResolvedValue(true),
    getState: () => state,
    updateState: (patch: Partial<PipelineState>) => {
      state = { ...state, ...patch };
    },
    sendMessage: vi.fn(),
    emitSpy,
  };
}

function getTool(name: string) {
  const tool = craftsmanTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function makeGlobalRules() {
  return {
    voice: 'Executive, direct, metrics-forward.',
    bullet_format: 'Action verb → scope → method → measurable result',
    length_target: '2 pages maximum',
    ats_rules: 'No tables, no columns, standard section headers only',
  };
}

function makeSectionWriterOutput(section = 'summary'): SectionWriterOutput {
  return {
    section,
    content: 'Engineering executive with 15 years building cloud-native platforms. Led $2.4M cost reduction through cloud migration.',
    keywords_used: ['cloud-native', 'P&L'],
    requirements_addressed: ['engineering leadership'],
    evidence_ids_used: ['ev_001'],
  };
}

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

// ─── write_section ────────────────────────────────────────────────────

describe('write_section', () => {
  const tool = getTool('write_section');

  beforeEach(() => {
    vi.mocked(runSectionWriter).mockReset();
  });

  it('happy path: runs section writer and emits section_draft event', async () => {
    vi.mocked(runSectionWriter).mockResolvedValueOnce(makeSectionWriterOutput('summary'));
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        blueprint_slice: { positioning_angle: 'Cloud-first executive' },
        evidence_sources: { evidence_library: [] },
        global_rules: makeGlobalRules(),
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.section).toBe('summary');
    expect(result.content).toContain('cloud-native');
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'section_draft', section: 'summary' }),
    );
    expect(ctx.scratchpad['section_summary']).toBeDefined();
  });

  it('stores result in scratchpad keyed by section name', async () => {
    vi.mocked(runSectionWriter).mockResolvedValueOnce(makeSectionWriterOutput('skills'));
    const ctx = makeCtx();

    await tool.execute(
      {
        section: 'skills',
        blueprint_slice: {},
        evidence_sources: {},
        global_rules: makeGlobalRules(),
      },
      ctx,
    );

    expect(ctx.scratchpad['section_skills']).toBeDefined();
  });

  it('builds cross_section_context from previously completed sections', async () => {
    // Pre-populate scratchpad with a completed section
    const ctx = makeCtx();
    ctx.scratchpad['section_summary'] = {
      section: 'summary',
      content: 'Cloud-first engineering executive with P&L ownership and platform leadership.',
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    };

    vi.mocked(runSectionWriter).mockResolvedValueOnce(makeSectionWriterOutput('skills'));

    await tool.execute(
      {
        section: 'skills',
        blueprint_slice: {},
        evidence_sources: {},
        global_rules: makeGlobalRules(),
      },
      ctx,
    );

    // Verify runSectionWriter was called with cross_section_context populated
    const callArg = vi.mocked(runSectionWriter).mock.calls[0][0];
    expect(callArg.cross_section_context).toBeDefined();
    expect(callArg.cross_section_context).toHaveProperty('summary');
  });

  it('passes undefined cross_section_context when no prior sections exist', async () => {
    vi.mocked(runSectionWriter).mockResolvedValueOnce(makeSectionWriterOutput('summary'));
    const ctx = makeCtx(); // empty scratchpad

    await tool.execute(
      {
        section: 'summary',
        blueprint_slice: {},
        evidence_sources: {},
        global_rules: makeGlobalRules(),
      },
      ctx,
    );

    const callArg = vi.mocked(runSectionWriter).mock.calls[0][0];
    expect(callArg.cross_section_context).toBeUndefined();
  });

  it('truncates cross_section_context entries to 600 characters', async () => {
    const ctx = makeCtx();
    const longContent = 'A'.repeat(900);
    ctx.scratchpad['section_summary'] = { section: 'summary', content: longContent, keywords_used: [], requirements_addressed: [], evidence_ids_used: [] };

    vi.mocked(runSectionWriter).mockResolvedValueOnce(makeSectionWriterOutput('skills'));

    await tool.execute(
      { section: 'skills', blueprint_slice: {}, evidence_sources: {}, global_rules: makeGlobalRules() },
      ctx,
    );

    const callArg = vi.mocked(runSectionWriter).mock.calls[0][0];
    const ctxSummary = callArg.cross_section_context?.summary;
    expect(ctxSummary).toBeDefined();
    expect(ctxSummary!.length).toBe(600);
  });
});

// ─── self_review_section ──────────────────────────────────────────────

describe('self_review_section', () => {
  const tool = getTool('self_review_section');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: returns passed=true when score >= 7 and issues <= 2', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        evaluations: [{ criterion: 'Quantified?', result: 'PASS', note: 'Has metrics' }],
        score: 8,
        passed: true,
        issues: ['Minor passive voice in bullet 3'],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Engineering executive led $2.4M cloud migration saving 40% in costs.' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.passed).toBe(true);
    expect(result.score).toBe(8);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('returns passed=false when score is below 7', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        evaluations: [],
        score: 5,
        passed: false,
        issues: ['No metrics', 'Passive voice throughout', 'Generic language'],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Responsible for engineering teams.' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.passed).toBe(false);
    expect(result.score).toBe(5);
    expect((result.issues as string[]).length).toBe(3);
  });

  it('handles malformed LLM JSON response gracefully', async () => {
    mockChat.mockResolvedValueOnce({
      text: 'This is not valid JSON at all }{[}',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Some content' },
      ctx,
    ) as Record<string, unknown>;

    // Should fall back gracefully, not throw
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(Array.isArray(result.issues)).toBe(true);
    expect((result.issues as string[]).length).toBeGreaterThan(0);
  });

  it('handles empty LLM response text gracefully', async () => {
    mockChat.mockResolvedValueOnce({
      text: '',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Content here' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.passed).toBe(false);
    expect(typeof result.score).toBe('number');
  });

  it('returns safe fallback when LLM returns string score instead of number', async () => {
    // Z.AI sometimes returns numeric fields as strings.
    // The guard `typeof parsed.score !== 'number'` triggers the malformed fallback
    // which returns score: 0 — this is intentional conservative behaviour.
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        evaluations: [],
        score: '9', // Z.AI string — fails the 'number' type guard
        passed: true,
        issues: [],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Strong content with metrics and evidence.' },
      ctx,
    ) as Record<string, unknown>;

    // After Zod + coercion: string '9' is coerced to number 9 — valid high score
    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(9);
    expect(result.passed).toBe(true);
  });

  it('forces passed=false when issues array has more than 2 entries even with high score', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        evaluations: [],
        score: 8,
        passed: true,
        issues: ['Issue 1', 'Issue 2', 'Issue 3'],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Content' },
      ctx,
    ) as Record<string, unknown>;

    // Tool enforces: passed = score >= 7 AND issues.length <= 2
    expect(result.passed).toBe(false);
  });
});

// ─── revise_section ───────────────────────────────────────────────────

describe('revise_section', () => {
  const tool = getTool('revise_section');

  beforeEach(() => {
    vi.mocked(runSectionRevision).mockReset();
  });

  it('happy path: calls runSectionRevision and emits section_revised', async () => {
    const revised = makeSectionWriterOutput('summary');
    revised.content = 'Revised: Engineering executive who built $2.4M cloud platform at scale.';
    vi.mocked(runSectionRevision).mockResolvedValueOnce(revised);
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        content: 'Original content with passive voice and no metrics.',
        issues: ['Add specific metrics', 'Replace passive voice with action verbs'],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.section).toBe('summary');
    expect(result.content).toContain('Revised');
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'section_revised', section: 'summary' }),
    );
    expect(ctx.scratchpad['section_summary']).toBeDefined();
  });

  it('joins issues array into a single revision instruction string', async () => {
    vi.mocked(runSectionRevision).mockResolvedValueOnce(makeSectionWriterOutput('skills'));
    const ctx = makeCtx();

    await tool.execute(
      {
        section: 'skills',
        content: 'Python, Java, SQL',
        issues: ['Group by category', 'Add cloud certifications'],
      },
      ctx,
    );

    const callArgs = vi.mocked(runSectionRevision).mock.calls[0];
    // Third arg is the revisionInstruction (joined issues)
    expect(callArgs[2]).toContain('Group by category');
    expect(callArgs[2]).toContain('Add cloud certifications');
  });

  it('uses fallback global_rules when not found in scratchpad', async () => {
    vi.mocked(runSectionRevision).mockResolvedValueOnce(makeSectionWriterOutput('summary'));
    const ctx = makeCtx();
    // No global_rules in scratchpad — tool should use fallback defaults

    await expect(
      tool.execute(
        { section: 'summary', content: 'Content', issues: ['Fix something'] },
        ctx,
      ),
    ).resolves.toBeDefined();

    // runSectionRevision signature: (section, original_content, revision_instruction, blueprint_slice, global_rules, options)
    const callArgs = vi.mocked(runSectionRevision).mock.calls[0];
    const globalRules = callArgs[4]; // index 4 = global_rules
    expect(globalRules.voice).toBe('executive');
  });
});

// ─── check_keyword_coverage ───────────────────────────────────────────

describe('check_keyword_coverage', () => {
  const tool = getTool('check_keyword_coverage');

  it('correctly identifies found and missing keywords', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        content: 'Engineering executive with cloud-native platform experience and P&L ownership.',
        target_keywords: ['cloud-native', 'P&L', 'kubernetes', 'microservices'],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.found).toEqual(expect.arrayContaining(['cloud-native', 'P&L']));
    expect(result.missing).toEqual(expect.arrayContaining(['kubernetes', 'microservices']));
    expect(result.coverage_pct).toBe(50);
  });

  it('returns 100% coverage when all keywords are found', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'skills',
        content: 'Cloud Architecture, Kubernetes, Microservices, DevOps',
        target_keywords: ['cloud', 'kubernetes', 'microservices'],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.coverage_pct).toBe(100);
    expect((result.missing as string[]).length).toBe(0);
  });

  it('returns 100% coverage when target_keywords is empty', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'summary', content: 'Some content', target_keywords: [] },
      ctx,
    ) as Record<string, unknown>;

    expect(result.coverage_pct).toBe(100);
  });

  it('is case-insensitive in matching', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        content: 'Led CLOUD-NATIVE platform migration',
        target_keywords: ['cloud-native'],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.found).toEqual(['cloud-native']);
    expect(result.coverage_pct).toBe(100);
  });
});

// ─── check_anti_patterns ──────────────────────────────────────────────

describe('check_anti_patterns', () => {
  const tool = getTool('check_anti_patterns');

  it('detects structural anti-patterns from regex list', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'experience',
        content: 'Responsible for managing the engineering team. Helped with product roadmap. Assisted in cloud migration.',
      },
      ctx,
    ) as Record<string, unknown>;

    const patterns = result.found_patterns as string[];
    expect(result.clean).toBe(false);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.some((p) => p.includes('"responsible for"'))).toBe(true);
    expect(patterns.some((p) => p.includes('"helped with/to"'))).toBe(true);
    expect(patterns.some((p) => p.includes('"assisted in"'))).toBe(true);
  });

  it('detects "team player" and "self-starter" clichés', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        content: 'Results-oriented team player and self-starter with a proven track record.',
      },
      ctx,
    ) as Record<string, unknown>;

    const patterns = result.found_patterns as string[];
    expect(result.clean).toBe(false);
    expect(patterns.some((p) => p.includes('"team player"'))).toBe(true);
    expect(patterns.some((p) => p.includes('"self-starter"'))).toBe(true);
  });

  it('returns clean=true for strong executive content with no anti-patterns', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'experience',
        content: 'Drove $12M revenue growth by launching 3 new product lines into enterprise market. Built 45-person engineering organization from 8-person team over 18 months.',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.clean).toBe(true);
    expect((result.found_patterns as string[]).length).toBe(0);
  });

  it('handles regex patterns that could be stateful (/g flag) correctly across multiple calls', async () => {
    const ctx = makeCtx();
    const content = 'Dynamic leader with proven track record and synergy across business units.';

    // Call tool twice on the same content — stateful /g regex can fail on second call
    const result1 = await tool.execute({ section: 's1', content }, ctx) as Record<string, unknown>;
    const result2 = await tool.execute({ section: 's2', content }, ctx) as Record<string, unknown>;

    // Both calls must produce the same result
    expect(result1.found_patterns).toEqual(result2.found_patterns);
    expect((result1.found_patterns as string[]).length).toBeGreaterThan(0);
  });

  it('detects age-sensitive experience quantifiers', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'summary',
        content: 'Senior professional with 30+ years of experience in enterprise software.',
      },
      ctx,
    ) as Record<string, unknown>;

    const patterns = result.found_patterns as string[];
    expect(result.clean).toBe(false);
    expect(patterns.some((p) => p.includes('Age-revealing'))).toBe(true);
  });
});

// ─── check_evidence_integrity ─────────────────────────────────────────

describe('check_evidence_integrity', () => {
  const tool = getTool('check_evidence_integrity');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: returns verified claims and empty flagged list', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ claims_verified: 4, claims_flagged: [] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'experience',
        content: 'Led $2.4M cloud migration saving 40% in costs.',
        evidence_library: [
          { id: 'ev_001', situation: 'Legacy infra causing outages', action: 'Led cloud migration', result: 'Reduced costs by $2.4M', metrics_defensible: true, user_validated: true },
        ],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.claims_verified).toBe(4);
    expect((result.claims_flagged as string[]).length).toBe(0);
  });

  it('returns flagged claims when LLM detects fabricated specifics', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        claims_verified: 2,
        claims_flagged: ['200-person team mentioned but evidence only shows 45'],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'experience',
        content: 'Managed 200-person organization across global offices.',
        evidence_library: [
          { id: 'ev_001', situation: 'Org scaling project', action: 'Led engineering', result: 'Built team of 45', metrics_defensible: true, user_validated: true },
        ],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.claims_verified).toBe(2);
    expect((result.claims_flagged as string[]).length).toBe(1);
  });

  it('falls back gracefully on malformed LLM response', async () => {
    mockChat.mockResolvedValueOnce({
      text: 'not json {{',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const ctx = makeCtx();

    const result = await tool.execute(
      { section: 'skills', content: 'Python, Java', evidence_library: [] },
      ctx,
    ) as Record<string, unknown>;

    expect(result.claims_verified).toBe(0);
    expect(Array.isArray(result.claims_flagged)).toBe(true);
    expect((result.claims_flagged as string[]).length).toBeGreaterThan(0);
  });

  it('handles empty evidence_library by flagging all specific metrics', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({
        claims_verified: 0,
        claims_flagged: ['$2.4M figure unverifiable — evidence library is empty'],
      }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        section: 'experience',
        content: 'Delivered $2.4M savings through cost optimization.',
        evidence_library: [],
      },
      ctx,
    ) as Record<string, unknown>;

    expect((result.claims_flagged as string[]).length).toBeGreaterThan(0);
  });
});

// ─── present_to_user ──────────────────────────────────────────────────

describe('present_to_user', () => {
  const tool = getTool('present_to_user');

  it('emits section_draft on first presentation, section_revised on second', async () => {
    const ctx = makeCtx();
    ctx.waitForUser = vi.fn().mockResolvedValue(true);
    ctx.scratchpad['section_summary'] = makeSectionWriterOutput('summary');

    // First call — should emit section_draft
    await tool.execute({ section: 'summary', content: 'Draft content' }, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'section_draft' }));

    ctx.emitSpy.mockClear();

    // Second call — should emit section_revised (since presented_summary is now true)
    ctx.waitForUser = vi.fn().mockResolvedValue(true);
    await tool.execute({ section: 'summary', content: 'Revised content' }, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'section_revised' }));
  });

  it('emits section_approved and updates approved_sections when user returns true', async () => {
    const ctx = makeCtx();
    ctx.waitForUser = vi.fn().mockResolvedValue(true);

    await tool.execute({ section: 'skills', content: 'Python, Cloud Architecture' }, ctx);

    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'section_approved' }));
    expect(ctx.getState().approved_sections).toContain('skills');
  });

  it('emits section_approved when user returns { approved: true }', async () => {
    const ctx = makeCtx();
    ctx.waitForUser = vi.fn().mockResolvedValue({ approved: true });

    await tool.execute({ section: 'summary', content: 'Content' }, ctx);

    expect(ctx.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'section_approved' }));
  });

  it('does NOT emit section_approved when user returns { approved: false, feedback }', async () => {
    const ctx = makeCtx();
    ctx.waitForUser = vi.fn().mockResolvedValue({
      approved: false,
      feedback: 'Please add more metrics to bullet 2',
    });

    await tool.execute({ section: 'experience', content: 'Led engineering team.' }, ctx);

    const approvalCalls = (ctx.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0]?.type === 'section_approved',
    );
    expect(approvalCalls.length).toBe(0);
    expect(ctx.getState().approved_sections).not.toContain('experience');
  });

  it('updates scratchpad content when user directly edits the section', async () => {
    const ctx = makeCtx();
    ctx.scratchpad['section_summary'] = makeSectionWriterOutput('summary');
    ctx.waitForUser = vi.fn().mockResolvedValue({
      approved: false,
      edited_content: 'User-edited content with their own words',
    });

    await tool.execute({ section: 'summary', content: 'Original content' }, ctx);

    const stored = ctx.scratchpad['section_summary'] as SectionWriterOutput;
    expect(stored.content).toBe('User-edited content with their own words');
    // Direct edit counts as approved
    expect(ctx.getState().approved_sections).toContain('summary');
  });

  it('does not add section to approved_sections if already present', async () => {
    const ctx = makeCtx({ approved_sections: ['skills'] });
    ctx.waitForUser = vi.fn().mockResolvedValue(true);

    await tool.execute({ section: 'skills', content: 'Python, Java' }, ctx);

    // approved_sections should not have duplicate entries
    const approvedCount = ctx.getState().approved_sections.filter((s) => s === 'skills').length;
    expect(approvedCount).toBe(1);
  });
});

// ─── emit_transparency (craftsman) ───────────────────────────────────

describe('emit_transparency (craftsman)', () => {
  const tool = getTool('emit_transparency');

  it('emits a transparency event with the provided message', async () => {
    const ctx = makeCtx({ current_stage: 'section_writing' });

    const result = await tool.execute({ message: 'Writing summary section...' }, ctx) as Record<string, unknown>;

    expect(result.emitted).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transparency',
        message: 'Writing summary section...',
        stage: 'section_writing',
      }),
    );
  });

  it('returns the message in the result', async () => {
    const ctx = makeCtx();

    const result = await tool.execute({ message: 'Self-reviewing skills section...' }, ctx) as Record<string, unknown>;

    expect(result.message).toBe('Self-reviewing skills section...');
  });
});
