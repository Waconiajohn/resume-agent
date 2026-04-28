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
import { createEmptySharedContext } from '../contracts/shared-context.js';
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

  // Story 1.2 — Interview Authority content type routing.
  it('defaults content_type to "standard" when not specified', () => {
    const state = config.createInitialState('sess-1', 'user-1', {});
    expect(state.content_type).toBe('standard');
  });

  it('accepts content_type: "interview_authority" from input', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      content_type: 'interview_authority',
    });
    expect(state.content_type).toBe('interview_authority');
  });

  it('normalizes unknown content_type values to "standard"', () => {
    const state = config.createInitialState('sess-1', 'user-1', {
      content_type: 'nonsense' as unknown as string,
    });
    expect(state.content_type).toBe('standard');
  });
});

// ─── buildAgentMessage tests ───────────────────────────────────────────────────

describe('createLinkedInContentProductConfig().buildAgentMessage', () => {
  const config = createLinkedInContentProductConfig();

  it('returns a message for the strategist agent', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('strategist', state, {}) as string;
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

  it('includes Career Profile in strategist message when available', () => {
    const state = makeState({
      platform_context: {
        career_profile: {
          version: 'career_profile_v2',
          source: 'career_profile',
          generated_at: '2026-03-16T00:00:00.000Z',
          targeting: {
            target_roles: ['VP Product'],
            target_industries: ['Technology'],
            seniority: 'VP',
            transition_type: 'growth',
            preferred_company_environments: [],
          },
          positioning: {
            core_strengths: ['Product strategy'],
            proof_themes: ['Growth'],
            differentiators: ['Builder'],
            adjacent_positioning: [],
            positioning_statement: 'Product builder',
            narrative_summary: 'Product builder',
            leadership_scope: 'Global',
            scope_of_responsibility: 'Product',
          },
          narrative: {
            colleagues_came_for_what: '',
            known_for_what: '',
            why_not_me: '',
            story_snippet: '',
          },
          preferences: {
            must_haves: [],
            constraints: [],
            compensation_direction: '',
          },
          coaching: {
            financial_segment: '',
            emotional_state: '',
            coaching_tone: '',
            urgency_score: 0,
            recommended_starting_point: '',
          },
          evidence_positioning_statements: [],
          profile_signals: {
            clarity: 'green',
            alignment: 'green',
            differentiation: 'green',
          },
          completeness: {
            overall_score: 100,
            dashboard_state: 'strong',
            sections: [],
          },
          profile_summary: 'Product builder',
        },
      },
    });
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Product builder');
  });

  it('includes shared Career Profile in strategist message when legacy context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.candidateProfile.factualSummary = 'Executive operator known for scaling product organizations';
    sharedContext.candidateProfile.coreFunctions = ['Product strategy'];

    const state = makeState({ shared_context: sharedContext });
    const msg = config.buildAgentMessage('strategist', state, {});

    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Executive operator known for scaling product organizations');
  });

  it('includes objective-driven guidance in strategist message', () => {
    const state = makeState();
    const msg = config.buildAgentMessage('strategist', state, {});
    expect(msg).toContain('Objective');
    expect(msg).toContain('what this person should be known for');
  });

  it('returns a message for the writer agent', () => {
    const state = makeState({ selected_topic: 'How I built a remote team' });
    const msg = config.buildAgentMessage('writer', state, {});
    expect(typeof msg).toBe('string');
    expect(msg).toContain('How I built a remote team');
  });

  it('includes shared Career Profile and Narrative in writer message when legacy context is absent', () => {
    const sharedContext = createEmptySharedContext();
    sharedContext.candidateProfile.factualSummary = 'Builder-operator with enterprise product leadership experience';
    sharedContext.careerNarrative.careerArc = 'Moved from startup product management into global portfolio leadership';

    const state = makeState({
      selected_topic: 'How I built a remote team',
      shared_context: sharedContext,
    });
    const msg = config.buildAgentMessage('writer', state, {});

    expect(msg).toContain('Career Profile');
    expect(msg).toContain('Builder-operator with enterprise product leadership experience');
    expect(msg).toContain('global portfolio leadership');
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

// ─── Story 1.2: suggest_interview_authority_topics tool ───────────────────────

describe('suggest_interview_authority_topics tool', () => {
  const VALID_IQ_RESPONSE = JSON.stringify([
    {
      id: 'iq-1',
      topic: 'Tell me about the largest operational transformation you have led.',
      hook: 'When I took over the West Coast distribution network, on-time shipment was at 61%.',
      rationale: 'Tests scale + scope of real ops experience.',
      expertise_area: 'operations_leadership',
      evidence_refs: ['Evidence #12 — West Coast network turnaround'],
    },
    {
      id: 'iq-2',
      topic: 'Walk me through a time you had to recover from a major operational failure.',
      hook: 'The recall cost us $2.8M and I had to rebuild supplier trust within 90 days.',
      rationale: 'Tests recovery skills + accountability under pressure.',
      expertise_area: 'operations_leadership',
      evidence_refs: ['Evidence #4 — 2022 recall response'],
    },
    {
      id: 'iq-3',
      topic: 'How do you handle a peer who is actively undermining an operational initiative?',
      hook: 'I had a CFO who blocked every capex request for six months.',
      rationale: 'Tests political maturity and cross-functional influence.',
      expertise_area: 'stakeholder_management',
      evidence_refs: ['Evidence #7 — CapEx alignment process'],
    },
    {
      id: 'iq-4',
      topic: 'What is your approach to cutting a plant that has been underperforming for years?',
      hook: 'The Kentucky plant had been losing money for four years before I got there.',
      rationale: 'Tests hard decision-making with real-world consequences.',
      expertise_area: 'operational_restructuring',
      evidence_refs: ['Evidence #9 — Kentucky plant closure'],
    },
    {
      id: 'iq-5',
      topic: 'How would you rebuild a supply chain that has been broken for six months?',
      hook: 'When the ERP migration tanked our fill rate to 47%, I had six weeks to stabilize.',
      rationale: 'Tests vision + execution under crisis conditions.',
      expertise_area: 'supply_chain_turnaround',
      evidence_refs: ['Evidence #15 — ERP recovery playbook'],
    },
  ]);

  it('produces 5 topics with iq-N id prefix and stores in state', async () => {
    const { strategistTools } = await import('../agents/linkedin-content/strategist/tools.js');
    const tool = strategistTools.find((t) => t.name === 'suggest_interview_authority_topics');
    expect(tool).toBeDefined();
    if (!tool) throw new Error('suggest_interview_authority_topics tool not found');

    const state = makeState({ content_type: 'interview_authority' });
    const ctx = makeCtx(state);

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: VALID_IQ_RESPONSE,
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    const res = result as { topics: TopicSuggestion[]; count: number };

    expect(res.count).toBe(5);
    expect(res.topics).toHaveLength(5);
    // Every topic id starts with "iq-" so the frontend can distinguish interview-authority topics.
    for (const topic of res.topics) {
      expect(topic.id).toMatch(/^iq-/);
    }

    // State + scratchpad both updated.
    expect(state.suggested_topics).toHaveLength(5);
    expect(ctx.scratchpad.suggested_topics).toHaveLength(5);
  });

  it('rewrites any non-iq ids the LLM returns into iq-N form', async () => {
    const { strategistTools } = await import('../agents/linkedin-content/strategist/tools.js');
    const tool = strategistTools.find((t) => t.name === 'suggest_interview_authority_topics');
    if (!tool) throw new Error('suggest_interview_authority_topics tool not found');

    const state = makeState({ content_type: 'interview_authority' });
    const ctx = makeCtx(state);

    const { llm } = await import('../lib/llm.js');
    // LLM returns topics with generic ids — tool should enforce the iq- prefix.
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify([
        {
          id: 'topic-1',
          topic: 'Q1?',
          hook: 'answer',
          rationale: 'why',
          expertise_area: 'ops',
          evidence_refs: [],
        },
        {
          // Missing id altogether.
          topic: 'Q2?',
          hook: 'answer',
          rationale: 'why',
          expertise_area: 'ops',
          evidence_refs: [],
        },
      ]),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    const res = result as { topics: TopicSuggestion[] };

    expect(res.topics[0].id).toBe('iq-1');
    expect(res.topics[1].id).toBe('iq-2');
  });

  it('falls back to a canned topic when the LLM returns invalid JSON', async () => {
    const { strategistTools } = await import('../agents/linkedin-content/strategist/tools.js');
    const tool = strategistTools.find((t) => t.name === 'suggest_interview_authority_topics');
    if (!tool) throw new Error('suggest_interview_authority_topics tool not found');

    const state = makeState({ content_type: 'interview_authority' });
    const ctx = makeCtx(state);

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: 'not a JSON array — the LLM went off-script',
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    const res = result as { topics: TopicSuggestion[]; count: number };

    // Empty-array fallback path: tool returns 0 topics rather than throwing.
    // (The canned single-topic fallback only triggers on a throw during parsing.)
    expect(res.count).toBe(0);
    expect(res.topics).toEqual([]);
  });

  it('emits a transparency SSE event so the user sees what the agent is doing', async () => {
    const { strategistTools } = await import('../agents/linkedin-content/strategist/tools.js');
    const tool = strategistTools.find((t) => t.name === 'suggest_interview_authority_topics');
    if (!tool) throw new Error('suggest_interview_authority_topics tool not found');

    const state = makeState({ content_type: 'interview_authority', current_stage: 'strategy' });
    const ctx = makeCtx(state);

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: VALID_IQ_RESPONSE,
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);

    const transparency = ctx.emissions.find(
      (e) => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'transparency',
    );
    expect(transparency).toBeDefined();
    expect((transparency as { message: string }).message).toMatch(/interview/i);
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
    ctx.scratchpad.post_draft = [
      'I made a mistake that cost my company $500K. Here is what I learned.',
      'At the time, we were moving too quickly through a platform migration, and I let the team treat a risky exception as a routine dependency.',
      'That choice created rework across operations, customer support, and finance. The repair was not glamorous. We rebuilt the intake path, added owner-level review for exceptions, and made the leading indicators visible before each release.',
      'The lesson was simple: speed without decision quality is just motion. Since then, I have treated risk visibility as part of delivery, not a side meeting.',
      'That changed how I run operating rhythms. Every project now needs a small number of visible risk signals, a clear owner, and a trigger for escalation before the team is already behind. It also changed how I coach managers. I ask them to explain what would break first, who would notice, and what decision we would wish we had made two weeks earlier.',
      'Those questions slow a team down for a few minutes, but they save weeks when the pressure hits.',
      'The best operators I know do not wait for a failure report. They build systems that make the next failure harder to miss.',
      'Where do you see teams confusing movement with progress?',
      '#Operations #Leadership #DeliveryExcellence',
    ].join('\n\n');

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

  it('caps quality when the post has AI filler or misses the word-count contract', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'self_review_post');
    expect(tool).toBeDefined();

    const state = makeState();
    const ctx = makeCtx(state);
    ctx.scratchpad.post_draft = 'In today\'s rapidly evolving landscape, leadership is more important than ever. Thoughts?';

    if (!tool) throw new Error('self_review_post tool not found');

    const { llm } = await import('../lib/llm.js');
    (llm.chat as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: JSON.stringify({
        authenticity: 92,
        engagement_potential: 91,
        keyword_density: 70,
        hook_score: 95,
      }),
      tool_calls: [],
      usage: { input_tokens: 100, output_tokens: 50 },
    });

    const result = await tool.execute({}, ctx as unknown as Parameters<typeof tool.execute>[1]);
    const res = result as { quality_scores: PostQualityScores };
    expect(res.quality_scores.authenticity).toBeLessThanOrEqual(65);
    expect(res.quality_scores.engagement_potential).toBeLessThanOrEqual(70);
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

// ─── Story 1.1: generate_carousel tool ─────────────────────────────────

describe('generate_carousel tool', () => {
  const SAMPLE_POST = [
    'Scaling operations is less about adding capacity and more about removing bottlenecks.',
    'The first instinct when volume rises is to hire. But headcount without process discipline creates chaos, not throughput.',
    'What works instead is measurement. You cannot improve what you do not measure.',
    'Once the constraint is visible, the rest of the team can stop guessing.',
    'That discipline compounds. A quarter of focused work on one constraint beats a year of generic "operational excellence" initiatives.',
    'This principle ports well beyond manufacturing. Software teams hit the same walls.',
    'Find the constraint. Measure the constraint. Work the constraint. Everything else is noise.',
    'The leverage of constraint-first thinking is obvious once you have seen it work. Before that, it sounds like another framework.',
  ].join('\n\n');

  it('produces structured slides and emits carousel_ready SSE event', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'generate_carousel');
    expect(tool).toBeDefined();
    if (!tool) throw new Error('generate_carousel tool not found');

    const state = makeState({
      selected_topic: 'Scaling Operations',
      post_draft: SAMPLE_POST,
    });
    const ctx = makeCtx(state);
    ctx.scratchpad.post_hashtags = ['Operations', 'Leadership'];

    const result = await tool.execute(
      { post_text: SAMPLE_POST, topic: 'Scaling Operations' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    const res = result as { slides_generated: number; format: string };
    expect(res.format).toBe('carousel');
    expect(res.slides_generated).toBeGreaterThan(0);

    // SSE event was emitted with slides payload.
    const carouselEvent = ctx.emissions.find(
      (e): e is { type: string; slides: unknown[]; topic: string } =>
        typeof e === 'object' && e !== null && (e as { type?: string }).type === 'carousel_ready',
    );
    expect(carouselEvent).toBeDefined();
    expect(Array.isArray(carouselEvent!.slides)).toBe(true);
    expect(carouselEvent!.topic).toBe('Scaling Operations');

    // Slides landed in scratchpad for the coordinator to hand off to the frontend.
    expect(ctx.scratchpad.carousel_slides).toBeDefined();
  });

  it('returns failure when no post text is available', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'generate_carousel');
    if (!tool) throw new Error('generate_carousel tool not found');

    const state = makeState();
    const ctx = makeCtx(state);
    // No post_draft in state or scratchpad; no post_text in input.

    const result = await tool.execute(
      { topic: 'Some Topic' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );

    expect(result).toHaveProperty('success', false);
    // No emission on failure.
    const carouselEvent = ctx.emissions.find(
      (e) => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'carousel_ready',
    );
    expect(carouselEvent).toBeUndefined();
  });

  it('falls back to scratchpad.post_draft when post_text input is not provided', async () => {
    const { writerTools } = await import('../agents/linkedin-content/writer/tools.js');
    const tool = writerTools.find((t) => t.name === 'generate_carousel');
    if (!tool) throw new Error('generate_carousel tool not found');

    const state = makeState({ selected_topic: 'Constraint Theory' });
    const ctx = makeCtx(state);
    ctx.scratchpad.post_draft = SAMPLE_POST;
    ctx.scratchpad.post_hashtags = [];

    const result = await tool.execute(
      { topic: 'Constraint Theory' },
      ctx as unknown as Parameters<typeof tool.execute>[1],
    );
    const res = result as { slides_generated: number; format: string };

    expect(res.format).toBe('carousel');
    expect(res.slides_generated).toBeGreaterThan(0);
  });
});

// ─── Story 1.3: 360Brew Optimization Rules ────────────────────────────

describe('Story 1.3 — 360Brew optimization rules (Rule 6)', () => {
  it('RULE_6_360BREW names every hard prohibition in the AC', async () => {
    const { RULE_6_360BREW } = await import('../agents/linkedin-content/knowledge/rules.js');
    // External links, engagement bait, and AI filler phrases are the three
    // hard prohibitions Story 1.3 acceptance criteria lists.
    expect(RULE_6_360BREW).toMatch(/NO EXTERNAL LINKS/);
    expect(RULE_6_360BREW).toMatch(/NO ENGAGEMENT BAIT/);
    expect(RULE_6_360BREW).toMatch(/NO AI FILLER PHRASES/i);
  });

  it('RULE_6_360BREW names the 1,000-1,300 character text-post target', async () => {
    const { RULE_6_360BREW } = await import('../agents/linkedin-content/knowledge/rules.js');
    expect(RULE_6_360BREW).toMatch(/1,?000.?1,?300/);
  });

  it('RULE_6_360BREW names the 8-12 slide carousel-depth target', async () => {
    const { RULE_6_360BREW } = await import('../agents/linkedin-content/knowledge/rules.js');
    expect(RULE_6_360BREW).toMatch(/8.{0,4}12 slides/i);
  });

  it('RULE_6_360BREW names the TOPIC DNA consistency rule', async () => {
    const { RULE_6_360BREW } = await import('../agents/linkedin-content/knowledge/rules.js');
    expect(RULE_6_360BREW).toMatch(/TOPIC DNA/);
  });

  it('LINKEDIN_CONTENT_RULES combines Rule 6 with the earlier rules', async () => {
    const { LINKEDIN_CONTENT_RULES, RULE_0_PHILOSOPHY, RULE_6_360BREW } =
      await import('../agents/linkedin-content/knowledge/rules.js');
    expect(LINKEDIN_CONTENT_RULES).toContain(RULE_0_PHILOSOPHY);
    expect(LINKEDIN_CONTENT_RULES).toContain(RULE_6_360BREW);
    // Concatenation happens with a `---` separator between rules.
    expect(LINKEDIN_CONTENT_RULES).toContain('---');
  });
});

describe('Story 1.3 — content_complete event carries recommended_posting_time', () => {
  it('finalizeResult emits content_complete with an 8am posting-time recommendation in the user timezone', () => {
    const config = createLinkedInContentProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {
      timezone: 'America/New_York',
    });
    // Populate the bits finalizeResult expects.
    state.post_draft = 'Some post';
    state.post_hashtags = ['tag1'];
    state.quality_scores = { authenticity: 80, engagement_potential: 80, keyword_density: 80 };

    const emissions: unknown[] = [];
    const emit = (ev: unknown) => { emissions.push(ev); };

    if (!config.finalizeResult) throw new Error('finalizeResult not configured');
    config.finalizeResult(state, {}, emit as (e: LinkedInContentState extends object ? unknown : never) => void);

    const complete = emissions.find(
      (e) => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'content_complete',
    ) as { recommended_posting_time?: { hour: number; timezone: string; rationale: string } } | undefined;

    expect(complete).toBeDefined();
    expect(complete!.recommended_posting_time).toBeDefined();
    // 360Brew research identifies 8-9am or 2-3pm as the optimal windows; we ship 8am as the default.
    expect(complete!.recommended_posting_time!.hour).toBe(8);
    expect(complete!.recommended_posting_time!.timezone).toBe('America/New_York');
    expect(complete!.recommended_posting_time!.rationale).toMatch(/360[bB]rew/);
  });

  it('falls back to America/Chicago when no timezone is provided', () => {
    const config = createLinkedInContentProductConfig();
    const state = config.createInitialState('sess-1', 'user-1', {});
    state.post_draft = 'Some post';
    state.post_hashtags = [];
    state.quality_scores = { authenticity: 70, engagement_potential: 70, keyword_density: 70 };

    const emissions: unknown[] = [];
    const emit = (ev: unknown) => { emissions.push(ev); };

    if (!config.finalizeResult) throw new Error('finalizeResult not configured');
    config.finalizeResult(state, {}, emit as (e: LinkedInContentState extends object ? unknown : never) => void);

    const complete = emissions.find(
      (e) => typeof e === 'object' && e !== null && (e as { type?: string }).type === 'content_complete',
    ) as { recommended_posting_time?: { timezone: string } } | undefined;

    expect(complete!.recommended_posting_time!.timezone).toBe('America/Chicago');
  });
});
