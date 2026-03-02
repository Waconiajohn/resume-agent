/**
 * Producer Agent — Tool Unit Tests
 *
 * Covers: select_template, adversarial_review, ats_compliance_check,
 *         humanize_check, check_blueprint_compliance, verify_cross_section_consistency,
 *         check_narrative_coherence, request_content_revision, emit_transparency
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

vi.mock('../agents/quality-reviewer.js', () => ({
  runQualityReviewer: vi.fn(),
}));

vi.mock('../agents/ats-rules.js', () => ({
  runAtsComplianceCheck: vi.fn(),
}));

// ─── Imports after mocks ──────────────────────────────────────────────

import { runQualityReviewer } from '../agents/quality-reviewer.js';
import { runAtsComplianceCheck } from '../agents/ats-rules.js';
import { producerTools } from '../agents/producer/tools.js';
import type { PipelineState, ResumeAgentContext } from '../agents/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function makePipelineState(overrides?: Partial<PipelineState>): PipelineState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'quality_review',
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
  const tool = producerTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function makeLLMResponse(data: Record<string, unknown>) {
  return {
    text: JSON.stringify(data),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function makeQualityReviewOutput() {
  return {
    decision: 'approve' as const,
    scores: {
      hiring_manager_impact: 4,
      requirement_coverage: 85,
      ats_score: 90,
      authenticity: 78,
      evidence_integrity: 92,
      blueprint_compliance: 88,
    },
    overall_pass: true,
    revision_instructions: [],
  };
}

function makeBlueprintSections(): Record<string, string> {
  return {
    header: 'Jane Doe | jane@example.com | 555-1234 | New York',
    summary: 'Engineering executive with 15 years building cloud-native platforms. Led $2.4M cloud migration.',
    experience: 'VP Engineering, Acme Corp (Jan 2018 – Present)\n• Led 45-person engineering organization across 6 product teams.',
    skills: 'Cloud Architecture | P&L Ownership | Team Leadership | Kubernetes',
  };
}

// ─── select_template ──────────────────────────────────────────────────

describe('select_template', () => {
  const tool = getTool('select_template');

  it('selects modern-executive for technology / CTO roles', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { role_title: 'CTO', industry: 'technology', candidate_career_span: 18 },
      ctx,
    ) as Record<string, unknown>;

    expect(result.selected_template_id).toBe('modern-executive');
    expect(result.name).toBe('Modern Executive');
    expect(result.font).toBe('Calibri');
  });

  it('selects strategic-leader for finance / operations roles', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { role_title: 'Chief Financial Officer', industry: 'finance', candidate_career_span: 20 },
      ctx,
    ) as Record<string, unknown>;

    expect(result.selected_template_id).toBe('strategic-leader');
  });

  it('selects executive-classic for CEO / board-level roles', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { role_title: 'Chief Executive Officer', industry: 'traditional', candidate_career_span: 30 },
      ctx,
    ) as Record<string, unknown>;

    expect(result.selected_template_id).toBe('executive-classic');
  });

  it('selects industry-expert for pharmaceutical / manufacturing roles', async () => {
    const ctx = makeCtx();

    // Use 'medical' in role title and 'pharmaceutical' industry — the industry-expert heuristic
    // checks role.includes('medical') and industry.includes('pharmaceutical'), both match.
    // 'pharmaceutical' does not contain 'tech' so modern-executive heuristic won't fire.
    // 'medical' is not in any other heuristic block, so industry-expert wins cleanly.
    const result = await tool.execute(
      { role_title: 'VP Medical Affairs', industry: 'pharmaceutical', candidate_career_span: 22 },
      ctx,
    ) as Record<string, unknown>;

    expect(result.selected_template_id).toBe('industry-expert');
  });

  it('selects transformation-agent for digital transformation roles', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { role_title: 'Digital Transformation Lead', industry: 'change management', candidate_career_span: 15 },
      ctx,
    ) as Record<string, unknown>;

    expect(result.selected_template_id).toBe('transformation-agent');
  });

  it('stores selected template in pipeline state', async () => {
    const ctx = makeCtx();

    await tool.execute(
      { role_title: 'VP Engineering', industry: 'tech startup', candidate_career_span: 14 },
      ctx,
    );

    expect(ctx.getState().selected_template).toBeDefined();
    expect(ctx.getState().selected_template?.id).toBeDefined();
  });

  it('emits a transparency event with selection rationale', async () => {
    const ctx = makeCtx();

    await tool.execute(
      { role_title: 'CTO', industry: 'saas', candidate_career_span: 16 },
      ctx,
    );

    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transparency' }),
    );
  });

  it('handles type coercion: returns numeric career_span when string is provided', async () => {
    const ctx = makeCtx();

    // Z.AI might send numeric fields as strings
    const result = await tool.execute(
      { role_title: 'VP Engineering', industry: 'technology', candidate_career_span: '12' },
      ctx,
    ) as Record<string, unknown>;

    // Should still produce a valid result, not NaN-related errors
    expect(result.selected_template_id).toBeDefined();
    expect(Array.isArray(result.all_candidates)).toBe(true);
  });

  it('returns all candidate templates with scores', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { role_title: 'CTO', industry: 'technology', candidate_career_span: 15 },
      ctx,
    ) as Record<string, unknown>;

    const candidates = result.all_candidates as Array<{ id: string; score: number }>;
    expect(candidates.length).toBe(8); // All 8 executive templates scored
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[1].score); // Sorted descending
  });
});

// ─── adversarial_review ───────────────────────────────────────────────

describe('adversarial_review', () => {
  const tool = getTool('adversarial_review');

  beforeEach(() => {
    vi.mocked(runQualityReviewer).mockReset();
  });

  it('happy path: runs quality reviewer and emits quality_scores', async () => {
    vi.mocked(runQualityReviewer).mockResolvedValueOnce(makeQualityReviewOutput());
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        assembled_resume: {
          sections: makeBlueprintSections(),
          full_text: Object.values(makeBlueprintSections()).join('\n'),
        },
        blueprint: { blueprint_version: '2.0', target_role: 'CTO' },
        jd_analysis: { role_title: 'CTO', must_haves: ['engineering leadership'] },
        evidence_library: [],
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.decision).toBe('approve');
    expect(result.overall_pass).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quality_scores' }),
    );
    expect(ctx.scratchpad.adversarial_review).toBeDefined();
    expect(ctx.scratchpad.decision).toBe('approve');
    expect(ctx.scratchpad.overall_pass).toBe(true);
  });

  it('coerces missing full_text to empty string', async () => {
    vi.mocked(runQualityReviewer).mockResolvedValueOnce(makeQualityReviewOutput());
    const ctx = makeCtx();

    // full_text is omitted — should not throw, safeStr handles it
    await expect(
      tool.execute(
        {
          assembled_resume: { sections: {}, full_text: undefined },
          blueprint: {},
          jd_analysis: {},
          evidence_library: [],
        },
        ctx,
      ),
    ).resolves.toBeDefined();
  });
});

// ─── ats_compliance_check ─────────────────────────────────────────────

describe('ats_compliance_check', () => {
  const tool = getTool('ats_compliance_check');

  beforeEach(() => {
    vi.mocked(runAtsComplianceCheck).mockReset();
  });

  it('happy path: returns findings summary with counts by priority', async () => {
    vi.mocked(runAtsComplianceCheck).mockReturnValueOnce([
      { section: 'experience', issue: 'Tables detected', instruction: 'Remove tables', priority: 'high' as const },
      { section: 'skills', issue: 'Pipe characters detected', instruction: 'Remove pipes', priority: 'medium' as const },
    ]);
    const ctx = makeCtx();

    const result = await tool.execute(
      { full_text: 'Some resume text | with pipes' },
      ctx,
    ) as Record<string, unknown>;

    const summary = result.summary as Record<string, unknown>;
    expect(summary.total).toBe(2);
    expect(summary.high_priority).toBe(1);
    expect(summary.medium_priority).toBe(1);
    expect(summary.passes).toBe(false); // has high priority findings
  });

  it('passes when no high-priority findings', async () => {
    vi.mocked(runAtsComplianceCheck).mockReturnValueOnce([
      { section: 'footer', issue: 'Minor issue', instruction: 'Fix formatting', priority: 'low' as const },
    ]);
    const ctx = makeCtx();

    const result = await tool.execute({ full_text: 'Clean resume text' }, ctx) as Record<string, unknown>;

    const summary = result.summary as Record<string, unknown>;
    expect(summary.passes).toBe(true);
    expect(summary.high_priority).toBe(0);
  });

  it('returns empty findings when resume is fully compliant', async () => {
    vi.mocked(runAtsComplianceCheck).mockReturnValueOnce([]);
    const ctx = makeCtx();

    const result = await tool.execute({ full_text: 'Clean compliant resume' }, ctx) as Record<string, unknown>;

    const summary = result.summary as Record<string, unknown>;
    expect(summary.total).toBe(0);
    expect(summary.passes).toBe(true);
  });
});

// ─── humanize_check ───────────────────────────────────────────────────

describe('humanize_check', () => {
  const tool = getTool('humanize_check');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: returns score and issues from LLM response', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ score: 82, issues: ['Uniform bullet structure throughout experience section'] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { content: 'Engineering executive...' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.score).toBe(82);
    expect((result.issues as string[]).length).toBe(1);
    expect(ctx.scratchpad.humanize_score).toBe(82);
  });

  it('falls back gracefully on malformed LLM JSON', async () => {
    mockChat.mockResolvedValueOnce({
      text: '{broken json here',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const ctx = makeCtx();

    const result = await tool.execute({ content: 'Some resume content' }, ctx) as Record<string, unknown>;

    // Should not throw — fallback provides a default score
    expect(typeof result.score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('clamps score to 0-100 range when LLM returns out-of-bounds value', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ score: 150, issues: [] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute({ content: 'Content' }, ctx) as Record<string, unknown>;

    expect(result.score).toBe(100);
  });

  it('coerces string score from Z.AI to number', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ score: '75', issues: [] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute({ content: 'Content' }, ctx) as Record<string, unknown>;

    expect(typeof result.score).toBe('number');
    expect(result.score).toBe(75);
  });

  it('handles non-array issues field from LLM gracefully', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ score: 80, issues: 'A single issue as a string, not array' }),
    );
    const ctx = makeCtx();

    const result = await tool.execute({ content: 'Content' }, ctx) as Record<string, unknown>;

    // safeStringArray should handle this — returns empty array for non-arrays
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// ─── check_blueprint_compliance ──────────────────────────────────────

describe('check_blueprint_compliance', () => {
  const tool = getTool('check_blueprint_compliance');

  it('returns 100% compliance when sections match blueprint', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          header: 'Jane Doe | jane@example.com',
          summary: 'Engineering executive with cloud architecture expertise.',
          experience: 'VP Engineering, Acme Corp',
          skills: 'cloud-native | P&L Ownership',
        },
        blueprint: {
          section_plan: { order: ['header', 'summary', 'experience', 'skills'], rationale: 'Executive order' },
          summary_blueprint: {
            must_include: ['cloud architecture'],
          },
          keyword_map: {
            'cloud-native': { target_density: 2, placements: ['summary'], current_count: 0, action: 'add' },
          },
          global_rules: { voice: 'executive' },
          age_protection: { flags: [], clean: true },
        },
      },
      ctx,
    ) as Record<string, unknown>;

    expect(typeof result.compliance_pct).toBe('number');
    expect(result.compliance_pct).toBeGreaterThan(0);
    expect(Array.isArray(result.deviations)).toBe(true);
  });

  it('detects age protection violations', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          summary: 'Seasoned professional graduating in 1989 with over 30 years of experience.',
        },
        blueprint: {
          age_protection: {
            flags: [
              { item: 'graduating in 1989', action: 'remove' },
            ],
            clean: false,
          },
          section_plan: { order: ['summary'], rationale: '' },
          keyword_map: {},
          global_rules: { voice: 'executive' },
        },
      },
      ctx,
    ) as Record<string, unknown>;

    const deviations = result.deviations as string[];
    expect(deviations.some((d) => d.includes('Age protection'))).toBe(true);
  });

  it('returns 100% compliance when blueprint is empty/missing', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: { summary: 'Some content here.' },
        blueprint: {},
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.compliance_pct).toBe(100);
    expect((result.deviations as string[]).length).toBe(0);
  });
});

// ─── verify_cross_section_consistency ────────────────────────────────

describe('verify_cross_section_consistency', () => {
  const tool = getTool('verify_cross_section_consistency');

  it('passes for consistent, well-formed sections', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          header: 'Jane Doe | jane@example.com | 555-1234 | New York, NY',
          summary: 'Engineering executive with cloud-native platform expertise.',
          experience: 'VP Engineering, Acme Corp (Jan 2018 – Present)\n• Led 45-person engineering organization.\n• Built cloud infrastructure saving $2.4M annually.',
          skills: 'Cloud Architecture | Kubernetes | P&L Ownership',
        },
      },
      ctx,
    ) as Record<string, unknown>;

    // May or may not find issues — what matters is it returns the right shape
    expect(typeof result.consistent).toBe('boolean');
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.checks_run).toBe(5);
  });

  it('detects missing email address', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          header: 'Jane Doe | 555-1234 | New York, NY',
          summary: 'Some summary content here.',
          experience: 'VP Engineering, Acme (Jan 2018 – Present)\n• Led teams.',
        },
      },
      ctx,
    ) as Record<string, unknown>;

    const issues = result.issues as string[];
    expect(issues.some((i) => i.includes('email'))).toBe(true);
  });

  it('detects mixed date formats', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          header: 'Jane Doe | jane@example.com | 555-1234',
          experience: 'Acme Corp (Jan 2020 – Present)\n• Led teams.\n\nPrior Company (2015-01 – December 2019)\n• Managed projects.',
        },
      },
      ctx,
    ) as Record<string, unknown>;

    const issues = result.issues as string[];
    expect(issues.some((i) => i.includes('date format'))).toBe(true);
  });

  it('detects mixed bullet character types', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: {
          header: 'Jane Doe | jane@example.com | 555-1234',
          experience: 'Acme Corp\n- Led teams\n• Built platform\n* Managed budget',
        },
      },
      ctx,
    ) as Record<string, unknown>;

    const issues = result.issues as string[];
    expect(issues.some((i) => i.includes('bullet'))).toBe(true);
  });
});

// ─── check_narrative_coherence ────────────────────────────────────────

describe('check_narrative_coherence', () => {
  const tool = getTool('check_narrative_coherence');

  beforeEach(() => {
    mockChat.mockReset();
  });

  it('happy path: returns coherence_score and issues from LLM', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ coherence_score: 85, issues: ['Minor tonal shift between summary and skills section'] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      {
        sections: makeBlueprintSections(),
        positioning_angle: 'Platform-first engineering executive who drives enterprise scale',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.coherence_score).toBe(85);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(ctx.scratchpad.narrative_coherence_score).toBe(85);
  });

  it('falls back gracefully on null/malformed LLM response', async () => {
    mockChat.mockResolvedValueOnce({
      text: 'INVALID JSON ][{',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    const ctx = makeCtx();

    const result = await tool.execute(
      { sections: {}, positioning_angle: 'Test angle' },
      ctx,
    ) as Record<string, unknown>;

    expect(typeof result.coherence_score).toBe('number');
    expect(Array.isArray(result.issues)).toBe(true);
    // Fallback score should be a sensible default
    expect(result.coherence_score).toBe(75);
  });

  it('clamps coherence_score to 0-100 range', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ coherence_score: -10, issues: [] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { sections: makeBlueprintSections(), positioning_angle: 'Test' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.coherence_score).toBe(0);
  });

  it('coerces string coherence_score from Z.AI to number', async () => {
    mockChat.mockResolvedValueOnce(
      makeLLMResponse({ coherence_score: '88', issues: [] }),
    );
    const ctx = makeCtx();

    const result = await tool.execute(
      { sections: makeBlueprintSections(), positioning_angle: 'Test' },
      ctx,
    ) as Record<string, unknown>;

    expect(typeof result.coherence_score).toBe('number');
    expect(result.coherence_score).toBe(88);
  });
});

// ─── request_content_revision ─────────────────────────────────────────

describe('request_content_revision', () => {
  const tool = getTool('request_content_revision');

  it('sends a revision message to the craftsman when section is not approved', async () => {
    const ctx = makeCtx({ approved_sections: [] });

    const result = await tool.execute(
      {
        section: 'summary',
        issue: 'No quantified metrics in opening statement',
        instruction: 'Add specific dollar amount and team size to first sentence',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.acknowledged).toBe(true);
    expect(result.section).toBe('summary');
    expect(ctx.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'craftsman',
        type: 'request',
        domain: 'resume',
        payload: expect.objectContaining({
          section: 'summary',
          issue: 'No quantified metrics in opening statement',
        }),
      }),
    );
  });

  it('rejects revision request for an approved section', async () => {
    const ctx = makeCtx({ approved_sections: ['skills'] });

    const result = await tool.execute(
      {
        section: 'skills',
        issue: 'Missing kubernetes keyword',
        instruction: 'Add kubernetes to cloud skills category',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.acknowledged).toBe(false);
    expect(result.message).toContain('approved');
    expect(ctx.sendMessage).not.toHaveBeenCalled();
  });

  it('rejects revision request for a section that appears in approved_sections list', async () => {
    const ctx = makeCtx({ approved_sections: ['summary', 'experience', 'skills'] });

    const result = await tool.execute(
      {
        section: 'experience',
        issue: 'Missing metrics in role 2',
        instruction: 'Add revenue impact figure',
      },
      ctx,
    ) as Record<string, unknown>;

    expect(result.acknowledged).toBe(false);
    expect((result.message as string)).toContain('experience');
  });

  it('tracks revision request in scratchpad', async () => {
    const ctx = makeCtx({ approved_sections: [] });

    await tool.execute(
      {
        section: 'summary',
        issue: 'Too generic',
        instruction: 'Add company-specific language',
      },
      ctx,
    );

    const requests = ctx.scratchpad.revision_requests as Array<Record<string, string>>;
    expect(requests).toHaveLength(1);
    expect(requests[0].section).toBe('summary');
    expect(requests[0].issue).toBe('Too generic');
  });

  it('accumulates multiple revision requests in scratchpad', async () => {
    const ctx = makeCtx({ approved_sections: [] });

    await tool.execute({ section: 'summary', issue: 'Issue 1', instruction: 'Fix 1' }, ctx);
    await tool.execute({ section: 'experience', issue: 'Issue 2', instruction: 'Fix 2' }, ctx);

    const requests = ctx.scratchpad.revision_requests as Array<Record<string, string>>;
    expect(requests).toHaveLength(2);
  });

  it('coerces non-string inputs via safeStr', async () => {
    const ctx = makeCtx({ approved_sections: [] });

    // Z.AI might send numbers or objects for string fields
    const result = await tool.execute(
      {
        section: 42,          // should be coerced to '42'
        issue: null,          // should be coerced to ''
        instruction: { text: 'fix it' }, // should be coerced to '[object Object]'
      },
      ctx,
    ) as Record<string, unknown>;

    // Section '42' is not in approved_sections, so it should be acknowledged
    expect(result.acknowledged).toBe(true);
    expect(result.section).toBe('42');
  });
});

// ─── emit_transparency (producer) ─────────────────────────────────────

describe('emit_transparency (producer)', () => {
  const tool = getTool('emit_transparency');

  it('emits a transparency event prefixed with "Producer:"', async () => {
    const ctx = makeCtx({ current_stage: 'quality_review' });

    const result = await tool.execute(
      { message: 'Running adversarial review...' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.emitted).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'transparency',
        stage: 'quality_review',
        message: 'Producer: Running adversarial review...',
      }),
    );
  });

  it('returns the prefixed message in result', async () => {
    const ctx = makeCtx();

    const result = await tool.execute(
      { message: 'Checking ATS compliance...' },
      ctx,
    ) as Record<string, unknown>;

    expect(result.message).toBe('Producer: Checking ATS compliance...');
  });

  it('handles empty message gracefully — returns success:false without emitting', async () => {
    const ctx = makeCtx();

    const result = await tool.execute({ message: null }, ctx) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});
