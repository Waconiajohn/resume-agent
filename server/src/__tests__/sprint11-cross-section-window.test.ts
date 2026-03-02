/**
 * Sprint 11, Story 2 — Sliding Window for Cross-Section Context
 *
 * Verifies two behaviours of the cross-section context builder inside
 * write_section:
 *   1. When more than 5 sections exist in the scratchpad, only the LAST 5 are
 *      included in the cross-section context passed to the section writer.
 *   2. Excerpts are truncated to 600 chars (not the previous 300).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks — hoisted before all imports ───────────────────────────────

const mockRunSectionWriter = vi.hoisted(() => vi.fn());

vi.mock('../lib/llm.js', () => ({
  llm: { chat: vi.fn() },
  MODEL_LIGHT: 'mock-light',
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_PRICING: {},
}));

vi.mock('../agents/section-writer.js', () => ({
  runSectionWriter: mockRunSectionWriter,
  runSectionRevision: vi.fn(),
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
  createSessionLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock('../lib/llm-provider.js', () => ({
  startUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0 }),
  stopUsageTracking: vi.fn().mockReturnValue({ input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 }),
  setUsageTrackingContext: vi.fn(),
  createCombinedAbortSignal: vi.fn().mockReturnValue(new AbortController().signal),
}));

vi.mock('../lib/sentry.js', () => ({
  captureError: vi.fn(),
}));

vi.mock('../lib/feature-flags.js', () => ({
  FF_SELF_REVIEW_LIGHT: false,
  FF_BLUEPRINT_APPROVAL: true,
  FF_INTAKE_QUIZ: true,
  FF_RESEARCH_VALIDATION: true,
  FF_GAP_ANALYSIS_QUIZ: true,
  FF_QUALITY_REVIEW_APPROVAL: true,
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { craftsmanTools } from '../agents/craftsman/tools.js';
import type { PipelineState } from '../agents/types.js';
import logger from '../lib/logger.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWriteSectionTool() {
  const tool = craftsmanTools.find((t) => t.name === 'write_section');
  if (!tool) throw new Error('write_section tool not found in craftsmanTools');
  return tool;
}

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'section_writing',
    approved_sections: [],
    revision_count: 0,
    revision_counts: {},
    token_usage: { input_tokens: 0, output_tokens: 0, estimated_cost_usd: 0 },
    sections: {},
    ...overrides,
  };
}

/**
 * Build a mock ResumeAgentContext with a pre-populated scratchpad.
 *
 * @param sectionNames - Names of sections already written (stored in scratchpad)
 * @param contentLength - Character length of each section's content string
 */
function makeCtx(sectionNames: string[], contentLength = 100) {
  let state = makePipelineState();
  const emitSpy = vi.fn();

  const scratchpad: Record<string, unknown> = {};
  for (const name of sectionNames) {
    // Fill content with a repeated letter so we can later check it's the right section
    scratchpad[`section_${name}`] = {
      section: name,
      content: name.charAt(0).repeat(contentLength),
      keywords_used: [],
      requirements_addressed: [],
      evidence_ids_used: [],
    };
  }

  return {
    sessionId: 'test-session',
    userId: 'test-user',
    scratchpad,
    signal: new AbortController().signal,
    emit: emitSpy,
    waitForUser: vi.fn().mockResolvedValue(true),
    getState: () => state,
    updateState: (patch: Partial<PipelineState>) => {
      state = { ...state, ...patch };
    },
    sendMessage: vi.fn(),
  };
}

function makeWriterInput(section = 'new_section') {
  return {
    section,
    blueprint_slice: { do_not_include: [] },
    evidence_sources: {},
    global_rules: {
      voice: 'executive',
      bullet_format: 'RAS',
      length_target: '1-2 pages',
      ats_rules: 'standard',
    },
  };
}

function makeSectionWriterResponse(section: string) {
  return {
    section,
    content: `Generated content for ${section}.`,
    keywords_used: [],
    requirements_addressed: [],
    evidence_ids_used: [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Story 2 — Sliding window for cross-section context', () => {
  const tool = getWriteSectionTool();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRunSectionWriter.mockResolvedValue(makeSectionWriterResponse('new_section'));
  });

  it('passes cross_section_context with all sections when 5 or fewer exist', async () => {
    const existingSections = ['summary', 'skills', 'experience_role_0', 'education', 'certifications'];
    const ctx = makeCtx(existingSections);

    await tool.execute(makeWriterInput('new_section'), ctx);

    expect(mockRunSectionWriter).toHaveBeenCalledOnce();
    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    const crossCtx = callArg.cross_section_context as Record<string, string> | undefined;

    // All 5 existing sections should appear
    expect(crossCtx).toBeDefined();
    expect(Object.keys(crossCtx!)).toHaveLength(5);
    for (const name of existingSections) {
      expect(crossCtx).toHaveProperty(name);
    }
  });

  it('keeps only the LAST 5 sections when 8 sections exist in the scratchpad', async () => {
    // 8 sections: s1…s8 in insertion order
    const existingSections = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    const ctx = makeCtx(existingSections);

    await tool.execute(makeWriterInput('new_section'), ctx);

    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    const crossCtx = callArg.cross_section_context as Record<string, string>;

    // Only the last 5 (s4…s8) should appear
    expect(Object.keys(crossCtx)).toHaveLength(5);
    expect(crossCtx).not.toHaveProperty('s1');
    expect(crossCtx).not.toHaveProperty('s2');
    expect(crossCtx).not.toHaveProperty('s3');
    expect(crossCtx).toHaveProperty('s4');
    expect(crossCtx).toHaveProperty('s5');
    expect(crossCtx).toHaveProperty('s6');
    expect(crossCtx).toHaveProperty('s7');
    expect(crossCtx).toHaveProperty('s8');
  });

  it('keeps only the LAST 5 sections when exactly 6 sections exist in the scratchpad', async () => {
    const existingSections = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];
    const ctx = makeCtx(existingSections);

    await tool.execute(makeWriterInput('new_section'), ctx);

    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    const crossCtx = callArg.cross_section_context as Record<string, string>;

    expect(Object.keys(crossCtx)).toHaveLength(5);
    // 'alpha' is the oldest and should be dropped
    expect(crossCtx).not.toHaveProperty('alpha');
    expect(crossCtx).toHaveProperty('beta');
    expect(crossCtx).toHaveProperty('zeta');
  });

  it('truncates excerpts to 600 chars (not 300) when content is longer', async () => {
    // 1 section whose content is 900 chars long
    const ctx = makeCtx(['summary'], 900);

    await tool.execute(makeWriterInput('new_section'), ctx);

    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    const crossCtx = callArg.cross_section_context as Record<string, string>;

    expect(crossCtx).toHaveProperty('summary');
    // Excerpt must be exactly 600 chars (the slice limit)
    expect(crossCtx['summary'].length).toBe(600);
  });

  it('does not truncate excerpts shorter than 600 chars', async () => {
    // Content is only 250 chars — shorter than both the old (300) and new (600) limit
    const ctx = makeCtx(['summary'], 250);

    await tool.execute(makeWriterInput('new_section'), ctx);

    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    const crossCtx = callArg.cross_section_context as Record<string, string>;

    expect(crossCtx).toHaveProperty('summary');
    expect(crossCtx['summary'].length).toBe(250);
  });

  it('logs a warning when sections are dropped from the window', async () => {
    const existingSections = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
    const ctx = makeCtx(existingSections);

    await tool.execute(makeWriterInput('new_section'), ctx);

    // logger.warn should have been called (imported mock)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        section: 'new_section',
        total_sections: 8,
        dropped_count: 3,
      }),
      expect.stringContaining('cross-section context exceeds window'),
    );
  });

  it('does NOT log a warning when 5 or fewer sections exist', async () => {
    const existingSections = ['summary', 'skills', 'experience_role_0'];
    const ctx = makeCtx(existingSections);

    await tool.execute(makeWriterInput('new_section'), ctx);

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ dropped_count: expect.anything() }),
      expect.stringContaining('cross-section context exceeds window'),
    );
  });

  it('sets cross_section_context to undefined when no prior sections exist', async () => {
    // Empty scratchpad — no section_ keys at all
    const ctx = makeCtx([]);

    await tool.execute(makeWriterInput('new_section'), ctx);

    const callArg = mockRunSectionWriter.mock.calls[0][0] as Record<string, unknown>;
    // When no prior sections exist, cross_section_context must be undefined (not {})
    expect(callArg.cross_section_context).toBeUndefined();
  });
});
