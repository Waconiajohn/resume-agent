/**
 * LinkedIn Optimizer — write_experience_entries structured output tests.
 *
 * Story 56-3: Enhance write_experience_entries to produce per-role
 * ExperienceEntry data alongside the backward-compat sections.experience block.
 *
 * Verifies:
 * - experience_entries array is populated with per-role structured data
 * - Each entry has the required fields (role_id, company, title, duration, optimized, quality_scores)
 * - Combined sections.experience is still populated (backward compat for assemble_report)
 * - quality_scores default to 70 when LLM omits them
 * - Legacy 'content' field is accepted in place of 'optimized'
 * - Empty work_history → empty experience_entries array
 * - section_progress SSE events are emitted correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MockInstance } from 'vitest';

// ─── Hoisted mocks (must precede vi.mock calls) ───────────────────────────────

const mockChat = vi.hoisted(() => vi.fn());

// ─── Mock external dependencies before any imports ────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: () => ({
        eq: () => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('../lib/llm.js', () => ({
  llm: { chat: mockChat },
  MODEL_PRIMARY: 'mock-primary',
  MODEL_MID: 'mock-mid',
  MODEL_ORCHESTRATOR: 'mock-orchestrator',
  MODEL_LIGHT: 'mock-light',
  MODEL_PRICING: {},
}));

vi.mock('../lib/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  createSessionLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// ─── Imports (after mocks are declared) ──────────────────────────────────────

import { writerTools } from '../agents/linkedin-optimizer/writer/tools.js';
import type {
  LinkedInOptimizerState,
  LinkedInOptimizerSSEEvent,
  ExperienceEntry,
} from '../agents/linkedin-optimizer/types.js';
import { makeMockGenericContext } from './helpers/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(
  overrides: Partial<LinkedInOptimizerState> = {},
): LinkedInOptimizerState {
  return {
    session_id: 'test-session',
    user_id: 'test-user',
    current_stage: 'writing',
    sections: {
      headline: undefined,
      about: undefined,
      experience: undefined,
      keywords: undefined,
    },
    resume_data: {
      name: 'Jane Doe',
      current_title: 'VP of Operations',
      career_summary: 'Turnaround executive with 20 years in supply chain.',
      key_skills: ['Supply Chain', 'P&L Management'],
      key_achievements: ['Recovered $40M margin in 3 turnarounds'],
      work_history: [
        {
          company: 'Acme Corp',
          title: 'VP of Operations',
          duration: 'Jan 2018 – Present',
          highlights: ['Led 200-person org', 'Recovered $40M margin'],
        },
        {
          company: 'Beta Industries',
          title: 'Director of Supply Chain',
          duration: 'Mar 2014 – Dec 2017',
          highlights: ['Reduced lead time 35%'],
        },
      ],
    },
    ...overrides,
  };
}

function makeLLMResponse(entries: unknown[], rationale = 'Strategic approach'): {
  text: string;
  tool_calls: never[];
  usage: { input_tokens: number; output_tokens: number };
} {
  return {
    text: JSON.stringify({ entries, rationale }),
    tool_calls: [],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function getExperienceTool() {
  const tool = writerTools.find(t => t.name === 'write_experience_entries');
  if (!tool) throw new Error('write_experience_entries tool not found');
  return tool;
}

function getHeadlineTool() {
  const tool = writerTools.find(t => t.name === 'write_headline');
  if (!tool) throw new Error('write_headline tool not found');
  return tool;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('write_experience_entries — structured output (Story 56-3)', () => {
  let emitSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates experience_entries with per-role structured data', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);
    emitSpy = ctx.emitSpy;

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Recovered $40M margin across 3 turnarounds\n- Led 200-person global ops org',
        quality_scores: { impact: 90, metrics: 85, context: 80, keywords: 75 },
      },
      {
        company: 'Beta Industries',
        title: 'Director of Supply Chain',
        duration: 'Mar 2014 – Dec 2017',
        optimized: '- Reduced lead time 35% via lean redesign',
        quality_scores: { impact: 80, metrics: 75, context: 70, keywords: 65 },
      },
    ]));

    const tool = getExperienceTool();
    const result = JSON.parse(await tool.execute({}, ctx) as string);

    expect(result.success).toBe(true);
    expect(result.entries_count).toBe(2);

    const entries: ExperienceEntry[] = ctx.getState().experience_entries ?? [];
    expect(entries).toHaveLength(2);
  });

  it('each entry has all required fields', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Led 200-person org',
        quality_scores: { impact: 88, metrics: 80, context: 75, keywords: 70 },
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    const entries: ExperienceEntry[] = ctx.getState().experience_entries ?? [];
    const entry = entries[0];

    expect(entry.role_id).toBe('role_0');
    expect(entry.company).toBe('Acme Corp');
    expect(entry.title).toBe('VP of Operations');
    expect(entry.duration).toBe('Jan 2018 – Present');
    expect(entry.optimized).toContain('Led 200-person org');
    expect(entry.original).toBe('');
    expect(entry.quality_scores).toMatchObject({
      impact: 88,
      metrics: 80,
      context: 75,
      keywords: 70,
    });
  });

  it('assigns sequential role_ids (role_0, role_1, ...)', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      { company: 'A', title: 'T1', duration: '2020 – Now', optimized: '- Bullet 1' },
      { company: 'B', title: 'T2', duration: '2015 – 2020', optimized: '- Bullet 2' },
      { company: 'C', title: 'T3', duration: '2010 – 2015', optimized: '- Bullet 3' },
    ]));

    await getExperienceTool().execute({}, ctx);

    const entries = ctx.getState().experience_entries ?? [];
    expect(entries[0].role_id).toBe('role_0');
    expect(entries[1].role_id).toBe('role_1');
    expect(entries[2].role_id).toBe('role_2');
  });

  it('quality_scores default to 70 when LLM omits them', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Recovered $40M',
        // quality_scores intentionally omitted
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    const entries = ctx.getState().experience_entries ?? [];
    expect(entries[0].quality_scores).toEqual({
      impact: 70,
      metrics: 70,
      context: 70,
      keywords: 70,
    });
  });

  it('accepts legacy "content" field when LLM returns it instead of "optimized"', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        content: '- Legacy content field usage',  // old field name
        quality_scores: { impact: 60, metrics: 60, context: 60, keywords: 60 },
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    const entries = ctx.getState().experience_entries ?? [];
    expect(entries[0].optimized).toContain('Legacy content field usage');
  });

  it('populates sections.experience (backward compat for assemble_report)', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Recovered $40M margin',
        quality_scores: { impact: 90, metrics: 85, context: 80, keywords: 75 },
      },
    ], 'Strategic narrative approach'));

    await getExperienceTool().execute({}, ctx);

    const section = ctx.getState().sections.experience;
    expect(section).toBeDefined();
    expect(section!.section).toBe('experience');
    expect(section!.optimized).toContain('VP of Operations');
    expect(section!.optimized).toContain('Acme Corp');
    expect(section!.optimized).toContain('Recovered $40M margin');
    expect(section!.rationale).toBe('Strategic narrative approach');
    expect(typeof section!.word_count).toBe('number');
    expect(section!.word_count).toBeGreaterThan(0);
  });

  it('sections.experience.original captures current_profile.experience_text', async () => {
    const state = makeState({
      current_profile: {
        headline: 'VP of Operations',
        about: 'Experienced exec',
        experience_text: 'Original LinkedIn experience text here',
      },
    });
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Recovered $40M',
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    const section = ctx.getState().sections.experience;
    expect(section!.original).toBe('Original LinkedIn experience text here');
  });

  it('empty work_history produces empty experience_entries array', async () => {
    const state = makeState({
      resume_data: {
        name: 'Jane Doe',
        current_title: 'Executive',
        career_summary: 'Senior leader.',
        key_skills: [],
        key_achievements: [],
        work_history: [],
      },
    });
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([]));

    const result = JSON.parse(await getExperienceTool().execute({}, ctx) as string);

    expect(result.success).toBe(true);
    expect(result.entries_count).toBe(0);

    const entries = ctx.getState().experience_entries ?? [];
    expect(entries).toHaveLength(0);

    // Combined block should be empty string
    const section = ctx.getState().sections.experience;
    expect(section!.optimized).toBe('');
  });

  it('emits section_progress events for writing and complete stages', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);
    emitSpy = ctx.emitSpy;

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Led org',
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'section_progress', section: 'experience', status: 'writing' }),
    );
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'section_progress', section: 'experience', status: 'complete' }),
    );
  });

  it('returns error when resume_data is missing', async () => {
    const state = makeState({ resume_data: undefined });
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const result = JSON.parse(await getExperienceTool().execute({}, ctx) as string);

    expect(result.success).toBe(false);
    expect(result.error).toContain('No resume data');
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('handles malformed LLM JSON gracefully (falls back to empty entries)', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce({
      text: 'This is not JSON at all, sorry.',
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    // Should not throw
    const result = JSON.parse(await getExperienceTool().execute({}, ctx) as string);

    expect(result.success).toBe(true);
    expect(result.entries_count).toBe(0);
    const entries = ctx.getState().experience_entries ?? [];
    expect(entries).toHaveLength(0);
  });

  it('combined sections.experience markdown contains role headers for each entry', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    mockChat.mockResolvedValueOnce(makeLLMResponse([
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Led turnaround',
      },
      {
        company: 'Beta Industries',
        title: 'Director of Supply Chain',
        duration: 'Mar 2014 – Dec 2017',
        optimized: '- Reduced lead time 35%',
      },
    ]));

    await getExperienceTool().execute({}, ctx);

    const combined = ctx.getState().sections.experience!.optimized;
    expect(combined).toContain('### VP of Operations at Acme Corp');
    expect(combined).toContain('### Director of Supply Chain at Beta Industries');
    expect(combined).toContain('Jan 2018 – Present');
    expect(combined).toContain('Mar 2014 – Dec 2017');
  });

  it('experience_entries and sections.experience stay in sync (same bullet count)', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);

    const rawEntries = [
      {
        company: 'Acme Corp',
        title: 'VP of Operations',
        duration: 'Jan 2018 – Present',
        optimized: '- Bullet A\n- Bullet B',
        quality_scores: { impact: 85, metrics: 80, context: 75, keywords: 90 },
      },
    ];
    mockChat.mockResolvedValueOnce(makeLLMResponse(rawEntries));

    await getExperienceTool().execute({}, ctx);

    const entries = ctx.getState().experience_entries ?? [];
    const combined = ctx.getState().sections.experience!.optimized;

    // The optimized text of entry 0 should appear inside the combined block
    expect(combined).toContain(entries[0].optimized);
  });
});

describe('write_headline — complete LinkedIn headline variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes overlong headlines at phrase boundaries instead of cutting mid-thought', async () => {
    const state = makeState();
    const ctx = makeMockGenericContext<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>(state);
    const overlong = 'Operations Executive | Supply Chain Transformation | P&L Management | Lean Operating Systems | Global Manufacturing Leadership | Margin Recovery | Enterprise Transformation | Strategic Vendor Management | Cross-Functional Execution | This trailing phrase should not survive because it is too long';

    mockChat.mockResolvedValueOnce({
      text: JSON.stringify({
        options: [
          { label: 'Option A', headline: overlong, why_it_works: 'Uses resume-backed operations language.' },
          { label: 'Option B', headline: 'VP of Operations | Supply Chain | P&L Management', why_it_works: 'Direct and searchable.' },
          { label: 'Option C', headline: 'Margin Recovery Operator | Lean Transformation | Global Operations', why_it_works: 'Specific value proposition.' },
        ],
        recommended_headline: overlong,
        recommended_headline_rationale: 'Best fit.',
      }),
      tool_calls: [],
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    const result = JSON.parse(await getHeadlineTool().execute({}, ctx) as string);
    const recommendations = ctx.scratchpad.headline_recommendations as {
      recommended_headline: string;
      options: Array<{ headline: string }>;
    };

    expect(result.success).toBe(true);
    expect(recommendations.options).toHaveLength(3);
    expect(recommendations.recommended_headline.length).toBeLessThanOrEqual(220);
    expect(recommendations.recommended_headline).not.toMatch(/[|·•,-]\s*$/);
    expect(recommendations.recommended_headline).not.toContain('This trailing phrase');
  });
});
