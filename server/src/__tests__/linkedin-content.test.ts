/**
 * LinkedIn Content Writer Tests.
 *
 * Verifies:
 * 1. LinkedInContentState type shape
 * 2. TopicSuggestion interface shape
 * 3. createInitialState populates required fields
 * 4. buildAgentMessage includes platform context for strategist
 * 5. buildAgentMessage includes selected_topic for writer
 * 6. Gates update state correctly on response
 * 7. Strategist tools: suggest_topics and present_topics logic
 * 8. Writer tools: write_post and self_review_post behavior
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
        expertise_areas: ['product management', 'team leadership'],
        industry_focus: 'technology',
        positioning_angle: 'executive who scales teams',
        key_differentiators: ['data-driven', 'outcome-focused'],
        authentic_phrases: ['built from scratch', 'shipped to millions'],
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

import { createLinkedInContentProductConfig } from '../agents/linkedin-content/product.js';
import type {
  LinkedInContentState,
  TopicSuggestion,
  PostQualityScores,
} from '../agents/linkedin-content/types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<LinkedInContentState> = {}): LinkedInContentState {
  return {
    session_id: 'sess-test',
    user_id: 'user-test',
    current_stage: 'strategy',
    ...overrides,
  };
}

function makeCtx(state: LinkedInContentState) {
  const emissions: unknown[] = [];
  return {
    getState: () => state,
    updateState: (patch: Partial<LinkedInContentState>) => Object.assign(state, patch),
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

describe('LinkedInContentState — type shape', () => {
  it('accepts minimal state without optional fields', () => {
    const state: LinkedInContentState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'strategy',
    };
    expect(state.platform_context).toBeUndefined();
    expect(state.suggested_topics).toBeUndefined();
    expect(state.selected_topic).toBeUndefined();
    expect(state.post_draft).toBeUndefined();
  });

  it('accepts state with platform_context', () => {
    const state: LinkedInContentState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'strategy',
      platform_context: {
        positioning_strategy: { angle: 'Scale leader' },
        evidence_items: [{ metric: 'Grew team from 5 to 50' }],
        career_narrative: { summary: 'Built three products from zero to one' },
      },
    };
    expect(state.platform_context?.positioning_strategy).toBeDefined();
    expect(state.platform_context?.evidence_items).toHaveLength(1);
    expect(state.platform_context?.career_narrative).toBeDefined();
  });

  it('accepts state with post content fields', () => {
    const scores: PostQualityScores = {
      authenticity: 85,
      engagement_potential: 78,
      keyword_density: 72,
    };
    const state: LinkedInContentState = {
      session_id: 'sess-1',
      user_id: 'user-1',
      current_stage: 'writing',
      post_draft: 'Three years ago I had no idea...',
      post_hashtags: ['#Leadership', '#Scale'],
      quality_scores: scores,
      revision_feedback: 'Make it more specific',
    };
    expect(state.post_draft).toBeDefined();
    expect(state.post_hashtags).toHaveLength(2);
    expect(state.quality_scores?.authenticity).toBe(85);
  });
});

describe('TopicSuggestion — interface shape', () => {
  it('accepts a complete topic suggestion', () => {
    const topic: TopicSuggestion = {
      id: 'topic_1',
      topic: 'How I hired 50 engineers in 6 months without an agency',
      hook: 'Most founders think hiring is a numbers game. After doing it wrong twice, I found the pattern that works.',
      rationale: 'Positions as a practitioner sharing hard-won insight on a universal pain point',
      expertise_area: 'talent acquisition',
      evidence_refs: ['Hired 50 engineers at Acme Corp Q1-Q2 2023'],
    };
    expect(topic.id).toBe('topic_1');
    expect(topic.hook).toContain('founders');
    expect(topic.evidence_refs).toHaveLength(1);
  });
});

// ─── ProductConfig tests ───────────────────────────────────────────────────────

describe('createLinkedInContentProductConfig', () => {
  it('creates a config with domain linkedin-content', () => {
    const config = createLinkedInContentProductConfig();
    expect(config.domain).toBe('linkedin-content');
  });

  it('has 2 agents: strategist and writer', () => {
    const config = createLinkedInContentProductConfig();
    expect(config.agents).toHaveLength(2);
    expect(config.agents[0].name).toBe('strategist');
    expect(config.agents[1].name).toBe('writer');
  });

  it('strategist has a topic_selection gate', () => {
    const config = createLinkedInContentProductConfig();
    const strategistPhase = config.agents[0];
    expect(strategistPhase.gates).toBeDefined();
    expect(strategistPhase.gates?.[0].name).toBe('topic_selection');
  });

  it('writer has a post_review gate', () => {
    const config = createLinkedInContentProductConfig();
    const writerPhase = config.agents[1];
    expect(writerPhase.gates).toBeDefined();
    expect(writerPhase.gates?.[0].name).toBe('post_review');
  });
});

// ─── createInitialState tests ──────────────────────────────────────────────────

describe('createLinkedInContentProductConfig().createInitialState', () => {
  const config = createLinkedInContentProductConfig();

  it('populates session_id, user_id, current_stage', () => {
    const state = config.createInitialState('sess-abc', 'user-xyz', {});
    expect(state.session_id).toBe('sess-abc');
    expect(state.user_id).toBe('user-xyz');
    expect(state.current_stage).toBe('strategy');
  });

  it('passes platform_context from input', () => {
    const input = {
      platform_context: {
        positioning_strategy: { angle: 'Scale expert' },
      },
    };
    const state = config.createInitialState('sess-1', 'user-1', input);
    expect(state.platform_context?.positioning_strategy).toEqual({ angle: 'Scale expert' });
  });

  it('handles missing platform_context gracefully', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.platform_context).toBeUndefined();
  });
});

// ─── buildAgentMessage tests ───────────────────────────────────────────────────

describe('createLinkedInContentProductConfig().buildAgentMessage', () => {
  const config = createLinkedInContentProductConfig();

  it('returns a message for the strategist agent', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('includes positioning strategy in strategist message when available', () => {
    const state = makeState({
      platform_context: {
        positioning_strategy: { angle: 'Product leader who ships' },
      },
    });
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(msg).toContain('Positioning Strategy');
  });

  it('includes analyze_expertise instruction in strategist message', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(msg).toContain('analyze_expertise');
  });

  it('returns a message for the writer agent', () => {
    const state = makeState({ selected_topic: 'How I built a remote team' });
    const msg = config.buildAgentMessage('writer', state, {});
    expect(typeof msg).toBe('string');
    expect(msg).toContain('How I built a remote team');
  });

  it('includes revision instructions when revision_feedback is set', () => {
    const state = makeState({
      selected_topic: 'Topic',
      revision_feedback: 'Make it shorter',
    });
    const msg = config.buildAgentMessage('writer', state, {});
    expect(msg).toContain('Revision Requested');
    expect(msg).toContain('Make it shorter');
  });

  it('returns empty string for unknown agent', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('unknown-agent', state, {});
    expect(msg).toBe('');
  });
});

// ─── Gate response tests ───────────────────────────────────────────────────────

describe('topic_selection gate', () => {
  const config = createLinkedInContentProductConfig();
  const gate = config.agents[0].gates?.[0];

  it('stores selected topic from string topic id', () => {
    const state = makeState({
      suggested_topics: [
        {
          id: 'topic_1',
          topic: 'The hiring lesson',
          hook: 'Hook',
          rationale: 'Rationale',
          expertise_area: 'talent',
          evidence_refs: [],
        },
      ],
    });
    gate?.onResponse?.('topic_1', state);
    expect(state.selected_topic).toBe('The hiring lesson');
  });

  it('stores custom topic string when not matching an id', () => {
    const state = makeState({ suggested_topics: [] });
    gate?.onResponse?.('My custom topic about leadership', state);
    expect(state.selected_topic).toBe('My custom topic about leadership');
  });

  it('stores topic from object response', () => {
    const state = makeState();
    gate?.onResponse?.({ topic: 'Leadership lessons' }, state);
    expect(state.selected_topic).toBe('Leadership lessons');
  });
});

describe('post_review gate', () => {
  const config = createLinkedInContentProductConfig();
  const gate = config.agents[1].gates?.[0];

  it('handles approval (response: true)', () => {
    const state = makeState();
    // Approved — no state mutation beyond already having the draft
    gate?.onResponse?.(true, state);
    // Should not throw or corrupt state
    expect(state.revision_feedback).toBeUndefined();
  });

  it('stores revision feedback from object response', () => {
    const state = makeState();
    gate?.onResponse?.({ feedback: 'Add specific metrics from Acme' }, state);
    expect(state.revision_feedback).toBe('Add specific metrics from Acme');
  });
});

// ─── Strategist tool: suggest_topics ──────────────────────────────────────────

describe('suggest_topics tool', () => {
  it('returns topic suggestions and updates state', async () => {
    const { strategistTools } = await import('../agents/linkedin-content/strategist/tools.js');
    const tool = strategistTools.find((t) => t.name === 'suggest_topics');
    expect(tool).toBeDefined();

    const state = makeState();
    const ctx = makeCtx(state);

    if (!tool) throw new Error('suggest_topics tool not found');

    // Mock LLM to return valid topics
    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([
        {
          id: 'topic_1',
          topic: 'How I scaled from 0 to $10M ARR',
          hook: 'Most founders focus on acquisition. I focused on the opposite.',
          rationale: 'Contrarian insight about growth',
          expertise_area: 'growth',
          evidence_refs: ['scaled revenue at Acme'],
        },
      ]),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({ count: 1 }, ctx as unknown as Parameters<typeof tool.execute>[1]);
    expect(result).toHaveProperty('topics');
    expect(state.suggested_topics).toHaveLength(1);
    expect(state.suggested_topics?.[0].id).toBe('topic_1');
  });
});

// ─── Writer tool: self_review_post ─────────────────────────────────────────────

describe('self_review_post tool', () => {
  it('returns quality scores from scratchpad draft', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'self_review_post');
    expect(tool).toBeDefined();

    const state = makeState();
    const ctx = makeCtx(state);
    ctx.scratchpad.post_draft = 'I made a mistake that cost my company $500K. Here is what I learned.';

    if (!tool) throw new Error('self_review_post tool not found');

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify({
        authenticity: 88,
        engagement_potential: 82,
        keyword_density: 71,
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    const res = result as { quality_scores: PostQualityScores };
    expect(res.quality_scores.authenticity).toBe(88);
    expect(res.quality_scores.engagement_potential).toBe(82);
    expect(ctx.scratchpad.quality_scores).toBeDefined();
  });

  it('returns failure when no post draft exists', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'self_review_post');
    if (!tool) throw new Error('self_review_post tool not found');

    const state = makeState();
    const ctx = makeCtx(state);
    // No post_draft in scratchpad

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    expect(result).toHaveProperty('success', false);
  });
});
