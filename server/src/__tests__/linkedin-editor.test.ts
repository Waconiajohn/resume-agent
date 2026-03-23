/**
 * LinkedIn Profile Editor Tests.
 *
 * Verifies:
 * 1. LinkedInEditorState type shape
 * 2. ProfileSection type and PROFILE_SECTION_ORDER
 * 3. createInitialState populates required fields
 * 4. buildAgentMessage includes platform context and next section
 * 5. Gates update state correctly on approval/feedback
 * 6. Editor tools: write_section and self_review_section behavior
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/emotional-baseline.js', () => ({
  getToneGuidanceFromInput: () => '',
  getDistressFromInput: () => null,
}));

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

vi.mock('../lib/llm.js', () => ({
  llm: {
    chat: vi.fn().mockResolvedValue({
      text: JSON.stringify({
        headline_content: 'VP of Engineering | Scaling Product Teams | AI & Platform Infrastructure',
        keywords_used: ['VP of Engineering', 'Product Teams', 'AI', 'Infrastructure'],
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  },
  MODEL_PRIMARY: 'test-primary',
  MODEL_MID: 'test-mid',
  MODEL_LIGHT: 'test-light',
}));

vi.mock('../lib/json-repair.js', () => ({
  repairJSON: <T>(s: string): T | null => {
    try { return JSON.parse(s) as T; } catch { return null; }
  },
}));

import { createLinkedInEditorProductConfig } from '../agents/linkedin-editor/product.js';
import { createEmptySharedContext } from '../contracts/shared-context.js';
import {
  PROFILE_SECTION_ORDER,
  PROFILE_SECTION_LABELS,
} from '../agents/linkedin-editor/types.js';
import type {
  LinkedInEditorState,
  ProfileSection,
  SectionQualityScores,
} from '../agents/linkedin-editor/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<LinkedInEditorState> = {}): LinkedInEditorState {
  return {
    session_id: 'sess-test',
    user_id: 'user-test',
    current_stage: 'editing',
    sections_completed: [],
    section_drafts: {},
    section_feedback: {},
    quality_scores: {},
    ...overrides,
  };
}

function makeCtx(state: LinkedInEditorState) {
  const emissions: unknown[] = [];
  return {
    getState: () => state,
    updateState: (patch: Partial<LinkedInEditorState>) => Object.assign(state, patch),
    emit: (event: unknown) => { emissions.push(event); },
    waitForUser: vi.fn().mockResolvedValue(true),
    scratchpad: {} as Record<string, unknown>,
    sessionId: state.session_id,
    userId: state.user_id,
    signal: new AbortController().signal,
    sendMessage: vi.fn(),
    emissions,
  };
}

// ─── Type tests ────────────────────────────────────────────────────────────────

describe('LinkedInEditorState — type shape', () => {
  it('accepts minimal state', () => {
    const state: LinkedInEditorState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'editing',
      sections_completed: [],
      section_drafts: {},
      section_feedback: {},
      quality_scores: {},
    };
    expect(state.platform_context).toBeUndefined();
    expect(state.sections_completed).toHaveLength(0);
  });

  it('accepts state with completed sections', () => {
    const scores: SectionQualityScores = {
      keyword_coverage: 80,
      readability: 85,
      positioning_alignment: 75,
    };
    const state: LinkedInEditorState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'editing',
      sections_completed: ['headline', 'about'],
      section_drafts: {
        headline: 'VP of Engineering | AI & Platform | Scale Expert',
        about: 'I have spent 15 years building engineering teams...',
      },
      section_feedback: { headline: 'Looks great' },
      quality_scores: { headline: scores },
    };
    expect(state.sections_completed).toContain('headline');
    expect(state.section_drafts.headline).toBeTruthy();
    expect(state.quality_scores.headline?.keyword_coverage).toBe(80);
  });

  it('accepts state with current_profile', () => {
    const state: LinkedInEditorState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'editing',
      current_profile: 'John Smith | Software Engineer | LinkedIn',
      sections_completed: [],
      section_drafts: {},
      section_feedback: {},
      quality_scores: {},
    };
    expect(state.current_profile).toBeTruthy();
  });
});

// ─── ProfileSection constants ──────────────────────────────────────────────────

describe('PROFILE_SECTION_ORDER', () => {
  it('has 5 sections in correct order', () => {
    expect(PROFILE_SECTION_ORDER).toEqual(['headline', 'about', 'experience', 'skills', 'education']);
  });

  it('includes all expected sections', () => {
    const sections: ProfileSection[] = ['headline', 'about', 'experience', 'skills', 'education'];
    expect(PROFILE_SECTION_ORDER).toEqual(expect.arrayContaining(sections));
  });
});

describe('PROFILE_SECTION_LABELS', () => {
  it('has a label for each section', () => {
    for (const section of PROFILE_SECTION_ORDER) {
      expect(PROFILE_SECTION_LABELS[section]).toBeTruthy();
    }
  });
});

// ─── ProductConfig tests ───────────────────────────────────────────────────────

describe('createLinkedInEditorProductConfig', () => {
  it('creates a config with domain linkedin-editor', () => {
    const config = createLinkedInEditorProductConfig();
    expect(config.domain).toBe('linkedin-editor');
  });

  it('has 1 editor agent', () => {
    const config = createLinkedInEditorProductConfig();
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('editor');
  });

  it('has 5 per-section gates', () => {
    const config = createLinkedInEditorProductConfig();
    const editorPhase = config.agents[0];
    expect(editorPhase.gates).toHaveLength(5);
  });

  it('gate names follow section_review_{section} pattern', () => {
    const config = createLinkedInEditorProductConfig();
    const gates = config.agents[0].gates ?? [];
    for (const gate of gates) {
      expect(gate.name).toMatch(/^section_review_(headline|about|experience|skills|education)$/);
    }
  });
});

// ─── createInitialState tests ──────────────────────────────────────────────────

describe('createLinkedInEditorProductConfig().createInitialState', () => {
  const config = createLinkedInEditorProductConfig();

  it('populates session_id, user_id, current_stage', () => {
    const state = config.createInitialState('sess-abc', 'user-xyz', {});
    expect(state.session_id).toBe('sess-abc');
    expect(state.user_id).toBe('user-xyz');
    expect(state.current_stage).toBe('editing');
  });

  it('initializes empty collections', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.sections_completed).toEqual([]);
    expect(state.section_drafts).toEqual({});
    expect(state.section_feedback).toEqual({});
    expect(state.quality_scores).toEqual({});
  });

  it('passes current_profile from input', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      current_profile: 'John Smith | VP Engineering',
    });
    expect(state.current_profile).toBe('John Smith | VP Engineering');
  });

  it('passes platform_context from input', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      platform_context: { positioning_strategy: { angle: 'Scale expert' } },
    });
    expect(state.platform_context?.positioning_strategy).toEqual({ angle: 'Scale expert' });
  });

  it('preserves shared_context from input', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Profile rewrite should follow truthful executive positioning';
    const state = config.createInitialState('sess-1', 'user-1', {
      shared_context: sharedContext,
    });
    expect(state.shared_context?.positioningStrategy.positioningAngle).toBe('Profile rewrite should follow truthful executive positioning');
  });

  it('handles missing current_profile gracefully', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.current_profile).toBeUndefined();
  });
});

// ─── buildAgentMessage tests ───────────────────────────────────────────────────

describe('createLinkedInEditorProductConfig().buildAgentMessage', () => {
  const config = createLinkedInEditorProductConfig();

  it('returns a message for the editor agent', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('editor', state, {}) as string;
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('specifies headline as next section when no sections completed', () => {
    const state = makeState({ sections_completed: [] });
    const msg = config.buildAgentMessage('editor', state, {});
    expect(msg).toContain('headline');
  });

  it('specifies about as next section when headline is complete', () => {
    const state = makeState({
      sections_completed: ['headline'],
      section_drafts: { headline: 'VP of Engineering' },
    });
    const msg = config.buildAgentMessage('editor', state, {});
    expect(msg).toContain('"about"');
  });

  it('includes revision instructions when section_feedback is set', () => {
    const state = makeState({
      sections_completed: [],
      section_feedback: { headline: 'Too generic, be more specific' },
    });
    const msg = config.buildAgentMessage('editor', state, {});
    expect(msg).toContain('Revision Requested');
    expect(msg).toContain('Too generic');
  });

  it('includes positioning strategy in message', () => {
    const state = makeState({
      platform_context: { positioning_strategy: { angle: 'Product innovator' } },
    });
    const msg = config.buildAgentMessage('editor', state, {});
    expect(msg).toContain('Positioning Strategy');
  });

  it('includes canonical shared context when legacy room context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.careerNarrative.careerArc = 'Career story centered on leading product and platform scale-ups';
    sharedContext.positioningStrategy.positioningAngle = 'Executive profile translating delivery proof into recruiter-friendly LinkedIn language';
    const state = makeState({ shared_context: sharedContext });
    const msg = config.buildAgentMessage('editor', state, {});
    expect(msg).toContain('Career story centered on leading product and platform scale-ups');
    expect(msg).toContain('Executive profile translating delivery proof into recruiter-friendly LinkedIn language');
  });

  it('returns empty string for unknown agent', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('unknown', state, {});
    expect(msg).toBe('');
  });
});

// ─── Gate response tests ───────────────────────────────────────────────────────

describe('section_review gates', () => {
  const config = createLinkedInEditorProductConfig();
  const gates = config.agents[0].gates ?? [];
  const headlineGate = gates.find((g) => g.name === 'section_review_headline');

  it('marks section as completed on approval', () => {
    const state = makeState({
      section_drafts: { headline: 'VP Engineering | Scale' },
    });
    headlineGate?.onResponse?.(true, state);
    expect(state.sections_completed).toContain('headline');
  });

  it('marks section as completed on "approved" string', () => {
    const state = makeState({
      section_drafts: { headline: 'VP Engineering | Scale' },
    });
    headlineGate?.onResponse?.('approved', state);
    expect(state.sections_completed).toContain('headline');
  });

  it('stores feedback when revision is requested', () => {
    const state = makeState({
      section_drafts: { headline: 'VP Engineering | Scale' },
    });
    headlineGate?.onResponse?.({ feedback: 'Add industry keywords' }, state);
    expect(state.section_feedback?.headline).toBe('Add industry keywords');
    expect(state.sections_completed).not.toContain('headline');
  });

  it('gate condition is false when section has no draft', () => {
    const state = makeState({ section_drafts: {} });
    const fires = headlineGate?.condition?.(state);
    expect(fires).toBe(false);
  });

  it('gate condition is true when section has draft and is not approved', () => {
    const state = makeState({
      section_drafts: { headline: 'VP Engineering | Scale Expert' },
      sections_completed: [],
    });
    const fires = headlineGate?.condition?.(state);
    expect(fires).toBe(true);
  });

  it('gate condition is false when section is already approved', () => {
    const state = makeState({
      section_drafts: { headline: 'VP Engineering | Scale Expert' },
      sections_completed: ['headline'],
    });
    const fires = headlineGate?.condition?.(state);
    expect(fires).toBe(false);
  });
});

// ─── Editor tool: write_section ───────────────────────────────────────────────

describe('write_section tool', () => {
  it('writes headline section and stores in scratchpad', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'write_section');
    if (!tool) throw new Error('write_section tool not found');

    const state = makeState();
    const ctx = makeCtx(state);

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify({
        headline_content: 'VP of Engineering | Scale | AI Infrastructure',
        keywords_used: ['VP', 'Engineering', 'Scale', 'AI'],
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute(
      { section: 'headline' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    const res = result as { section: string; content: string };
    expect(res.section).toBe('headline');
    expect(res.content).toContain('VP of Engineering');
    expect(ctx.scratchpad['draft_headline']).toBeTruthy();
    expect(ctx.scratchpad.current_section).toBe('headline');
  });

  it('returns failure for invalid section', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'write_section');
    if (!tool) throw new Error('write_section tool not found');

    const state = makeState();
    const ctx = makeCtx(state);

    const result = await tool.execute(
      { section: 'invalid_section' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );
    expect(result).toHaveProperty('success', false);
  });
});

// ─── Editor tool: self_review_section ─────────────────────────────────────────

describe('self_review_section tool', () => {
  it('returns quality scores for a drafted section', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'self_review_section');
    if (!tool) throw new Error('self_review_section tool not found');

    const state = makeState();
    const ctx = makeCtx(state);
    ctx.scratchpad['draft_headline'] = 'VP of Engineering | AI & Platform | Scale Expert';
    ctx.scratchpad.current_section = 'headline';

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify({
        keyword_coverage: 82,
        readability: 90,
        positioning_alignment: 78,
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute(
      { section: 'headline' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    const res = result as { quality_scores: SectionQualityScores };
    expect(res.quality_scores.keyword_coverage).toBe(82);
    expect(res.quality_scores.readability).toBe(90);
    expect(ctx.scratchpad['scores_headline']).toBeDefined();
  });

  it('returns failure when no section draft exists', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'self_review_section');
    if (!tool) throw new Error('self_review_section tool not found');

    const state = makeState();
    const ctx = makeCtx(state);
    // No draft in scratchpad

    const result = await tool!.execute(
      { section: 'about' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );
    expect(result).toHaveProperty('success', false);
  });

  it('uses shared positioning context when legacy context is absent', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'self_review_section');
    if (!tool) throw new Error('self_review_section tool not found');

    const sharedContext = createEmptySharedContext();
    sharedContext.positioningStrategy.positioningAngle = 'Executive leader for cloud platform scale-ups';

    const state = makeState({ shared_context: sharedContext });
    const ctx = makeCtx(state);
    ctx.scratchpad['draft_headline'] = 'VP Engineering | Cloud Platforms | Scale';
    ctx.scratchpad.current_section = 'headline';

    const { llm } = await import('../lib/llm.js');
    const llmMock = llm.chat as ReturnType<typeof vi.fn>;
    llmMock.mockResolvedValue({
      text: JSON.stringify({
        keyword_coverage: 82,
        readability: 90,
        positioning_alignment: 78,
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await tool.execute(
      { section: 'headline' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    const callArgs = llmMock.mock.calls.at(-1)?.[0];
    const userContent = callArgs?.messages?.[0]?.content as string;
    expect(userContent).toContain('Target Positioning');
    expect(userContent).toContain('Executive leader for cloud platform scale-ups');
  });
});

describe('revise_section tool', () => {
  it('uses shared evidence context when legacy context is absent', async () => {
    const { editorTools } = await import('../agents/linkedin-editor/editor/tools.js');
    const tool = editorTools.find((t) => t.name === 'revise_section');
    if (!tool) throw new Error('revise_section tool not found');

    const sharedContext = createEmptySharedContext();
    sharedContext.evidenceInventory.evidenceItems = [
      {
        id: 'ev_engineering_scale',
        statement: 'Scaled an engineering organization from 40 to 150 people across three regions',
        level: 'DirectProof',
        sourceType: 'resume',
        sourceArtifactId: null,
        sourceExcerpt: 'Scaled an engineering organization from 40 to 150 people across three regions',
        supports: ['leadership scale'],
        limitations: [],
        requiresConfirmation: false,
        finalArtifactEligible: true,
        riskLabel: 'Low',
        confidence: 'High',
        provenance: {
          origin: 'platform_context',
          sourceProduct: 'linkedin-editor',
          sourceSessionId: 'sess-test',
          sourceContextType: 'evidence_item',
          capturedAt: '2026-03-23T00:00:00.000Z',
          mapper: 'test-fixture',
        },
      },
    ];
    sharedContext.evidenceInventory.directProof = [sharedContext.evidenceInventory.evidenceItems[0]];

    const state = makeState({ shared_context: sharedContext });
    const ctx = makeCtx(state);
    ctx.scratchpad['draft_about'] = 'I lead engineering teams.';

    const { llm } = await import('../lib/llm.js');
    const llmMock = llm.chat as ReturnType<typeof vi.fn>;
    llmMock.mockResolvedValue({
      text: JSON.stringify({
        about_content: 'I lead engineering organizations through global scale and platform modernization.',
        revision_notes: 'Added scale and modernization proof.',
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await tool.execute(
      { section: 'about', feedback: 'Make it more specific' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    const callArgs = llmMock.mock.calls.at(-1)?.[0];
    const userContent = callArgs?.messages?.[0]?.content as string;
    expect(userContent).toContain('Available Evidence');
    expect(userContent).toContain('Scaled an engineering organization from 40 to 150 people');
  });
});
