/**
 * LinkedIn Content Strategist — Tool definitions.
 *
 * 4 tools:
 * - analyze_expertise: Reads platform context to identify expertise areas
 * - suggest_topics: Generates 3-5 thought leadership topic ideas
 * - present_topics: Emits topics_ready SSE event for user topic selection
 * - emit_transparency: Shared transparency tool
 */

import type { LinkedInContentTool, TopicSuggestion } from '../types.js';
import { llm, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../types.js';

// ─── Tool: analyze_expertise ───────────────────────────────────────────

const analyzeExpertiseTool: LinkedInContentTool = {
  name: 'analyze_expertise',
  description:
    'Reads the platform context (positioning strategy, evidence items, career narrative) ' +
    'to identify the user\'s core expertise areas and industry focus. Returns a summary ' +
    'of what the user is positioned as an expert in. Call this first.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: 'Analyzing your expertise areas and positioning...',
    });

    const platformContext = state.platform_context;

    if (!platformContext?.positioning_strategy && !platformContext?.evidence_items) {
      // No platform context — return generic analysis placeholder
      const fallback = {
        expertise_areas: ['professional leadership', 'industry expertise', 'strategic thinking'],
        industry_focus: 'executive management',
        positioning_angle: 'experienced professional with proven results',
        key_differentiators: ['track record', 'leadership experience'],
      };
      ctx.scratchpad.expertise_analysis = fallback;
      return { expertise_analysis: fallback };
    }

    const contextParts: string[] = [];

    if (platformContext.positioning_strategy) {
      contextParts.push(
        '## Positioning Strategy',
        JSON.stringify(platformContext.positioning_strategy, null, 2),
      );
    }

    if (platformContext.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(
        '',
        '## Evidence Items',
        JSON.stringify(platformContext.evidence_items.slice(0, 10), null, 2),
      );
    }

    if (platformContext.career_narrative) {
      contextParts.push(
        '',
        '## Career Narrative',
        JSON.stringify(platformContext.career_narrative, null, 2),
      );
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system:
        'You extract expertise positioning from professional context. ' +
        'Return ONLY valid JSON, no markdown fencing, no comments.',
      messages: [
        {
          role: 'user',
          content: `Analyze this professional's context and extract their expertise positioning:

${contextParts.join('\n')}

Return JSON in this exact structure:
{
  "expertise_areas": ["area1", "area2", "area3"],
  "industry_focus": "primary industry or function",
  "positioning_angle": "how they are uniquely positioned as an expert",
  "key_differentiators": ["differentiator1", "differentiator2"],
  "authentic_phrases": ["phrase from their experience that sounds genuinely them"]
}`,
        },
      ],
    });

    const raw = response.text ?? '';
    let analysis: Record<string, unknown>;

    try {
      analysis = repairJSON<Record<string, unknown>>(raw) ?? {};
    } catch {
      analysis = {
        expertise_areas: ['professional leadership', 'strategic management'],
        industry_focus: 'executive management',
        positioning_angle: 'experienced executive with proven results',
        key_differentiators: ['track record', 'leadership depth'],
        authentic_phrases: [],
      };
    }

    ctx.scratchpad.expertise_analysis = analysis;

    return { expertise_analysis: analysis };
  },
};

// ─── Tool: suggest_topics ──────────────────────────────────────────────

const suggestTopicsTool: LinkedInContentTool = {
  name: 'suggest_topics',
  description:
    'Generates 3-5 LinkedIn post topic ideas. Each topic positions the user as a ' +
    'thought leader in their niche — not generic advice. Topics are rooted in real ' +
    'experience and evidence items. Stores suggestions in scratchpad.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      count: {
        type: 'number',
        description: 'Number of topic suggestions to generate (default: 5)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const count = typeof input.count === 'number' ? Math.min(Math.max(3, input.count), 7) : 5;

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Generating ${count} thought leadership topic ideas...`,
    });

    const expertiseAnalysis = ctx.scratchpad.expertise_analysis as Record<string, unknown> | undefined;
    const platformContext = state.platform_context;

    const contextParts: string[] = ['Generate LinkedIn post topic suggestions for this professional.', ''];

    if (expertiseAnalysis) {
      contextParts.push(
        '## Expertise Analysis',
        JSON.stringify(expertiseAnalysis, null, 2),
        '',
      );
    }

    if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(
        '## Available Evidence Items (use as hooks)',
        JSON.stringify(platformContext.evidence_items.slice(0, 8), null, 2),
        '',
      );
    }

    contextParts.push(
      `Generate exactly ${count} topic suggestions. Each must:`,
      '- Be rooted in a real experience or accomplishment from their evidence',
      '- Position them as a thought leader, not a generic advice giver',
      '- Have a specific, attention-grabbing hook that will stop the scroll',
      '- Be achievable in a 300-500 word post',
      '',
      'Return ONLY valid JSON array:',
      `[
  {
    "id": "topic_1",
    "topic": "The post subject/angle",
    "hook": "The exact opening line that will stop the scroll",
    "rationale": "Why this positions them as a thought leader",
    "expertise_area": "Which expertise area this showcases",
    "evidence_refs": ["which evidence items support this (brief descriptions)"]
  }
]`,
    );

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 3072,
      system:
        'You are a LinkedIn content strategist for executives. You suggest authentic thought ' +
        'leadership content rooted in real experience, not generic tips. ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: contextParts.join('\n'),
        },
      ],
    });

    const raw = response.text ?? '[]';
    let topics: TopicSuggestion[];

    try {
      const parsed = repairJSON<TopicSuggestion[]>(raw);
      topics = Array.isArray(parsed) ? parsed : [];
    } catch {
      // Fallback topics if LLM fails
      topics = [
        {
          id: 'topic_1',
          topic: 'The leadership lesson that changed how I build teams',
          hook: 'I used to think great hiring was about finding the best candidate. I was wrong.',
          rationale: 'Leadership insight positions them as a strategic thinker',
          expertise_area: 'leadership',
          evidence_refs: [],
        },
      ];
    }

    ctx.scratchpad.suggested_topics = topics;
    ctx.updateState({ suggested_topics: topics });

    return { topics, count: topics.length };
  },
};

// ─── Tool: present_topics ──────────────────────────────────────────────

const presentTopicsTool: LinkedInContentTool = {
  name: 'present_topics',
  description:
    'Emits the topics_ready SSE event to present the generated topic suggestions ' +
    'to the user for selection. No LLM call — just formats and emits. ' +
    'Call this after suggest_topics.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const topics = (ctx.scratchpad.suggested_topics ?? state.suggested_topics ?? []) as TopicSuggestion[];

    if (topics.length === 0) {
      return { success: false, reason: 'No topics to present — call suggest_topics first' };
    }

    ctx.emit({
      type: 'topics_ready',
      session_id: state.session_id,
      topics,
    });

    return { presented: true, topic_count: topics.length };
  },
};

// ─── Tool exports ──────────────────────────────────────────────────────

export const strategistTools: LinkedInContentTool[] = [
  analyzeExpertiseTool,
  suggestTopicsTool,
  presentTopicsTool,
  createEmitTransparency<LinkedInContentState, LinkedInContentSSEEvent>({ prefix: 'Strategist: ' }),
];
