/**
 * LinkedIn Content Strategist -- Tool definitions.
 *
 * 6 tools:
 * - analyze_expertise: Reads platform context to identify expertise areas
 * - suggest_topics: Generates 3-5 thought leadership topic ideas
 * - present_topics: Emits topics_ready SSE event for user topic selection
 * - plan_series: Plans a 12-16 post thought leadership series
 * - present_series: Emits series_plan_ready SSE event for user series approval
 * - emit_transparency: Shared transparency tool
 */

import type { LinkedInContentTool, TopicSuggestion, ContentSeries, SeriesPost } from '../types.js';
import { llm, MODEL_MID, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../types.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';
import {
  renderBenchmarkProfileDirectionSection,
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

// --- Tool: analyze_expertise -------------------------------------------

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
    const sharedContext = state.shared_context;

    if (!hasMeaningfulSharedValue(sharedContext?.positioningStrategy) && !platformContext?.positioning_strategy && !hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems) && !platformContext?.evidence_items) {
      // No platform context -- return generic analysis placeholder
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

    if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy',
        sharedStrategy: sharedContext?.positioningStrategy,
      }));
    } else if (platformContext?.positioning_strategy) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy',
        legacyStrategy: platformContext.positioning_strategy,
      }));
    }

    contextParts.push(...renderBenchmarkProfileDirectionSection({
      heading: '## Benchmark Profile Direction',
      sharedContext,
    }));

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Items',
        sharedInventory: sharedContext?.evidenceInventory,
        maxItems: 10,
      }));
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Items',
        legacyEvidence: platformContext.evidence_items,
        maxItems: 10,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## Career Narrative',
        sharedNarrative: sharedContext?.careerNarrative,
      }));
    } else if (platformContext?.career_narrative) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## Career Narrative',
        legacyNarrative: platformContext.career_narrative,
      }));
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
  "authentic_phrases": ["phrase from their experience that sounds genuinely them"],
  "signature_strengths": ["the 2-3 things they are most distinctively known for"],
  "career_themes": ["recurring theme or pattern across their career arc"]
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
        signature_strengths: [],
        career_themes: [],
      };
    }

    ctx.scratchpad.expertise_analysis = analysis;

    return { expertise_analysis: analysis };
  },
};

// --- Tool: suggest_topics ----------------------------------------------

const suggestTopicsTool: LinkedInContentTool = {
  name: 'suggest_topics',
  description:
    'Generates 3-5 LinkedIn post topic ideas. Each topic positions the user as a ' +
    'thought leader in their niche -- not generic advice. Topics are rooted in real ' +
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
    const sharedContext = state.shared_context;

    const contextParts: string[] = ['Generate LinkedIn post topic suggestions for this professional.', ''];

    if (expertiseAnalysis) {
      contextParts.push(
        '## Expertise Analysis',
        JSON.stringify(expertiseAnalysis, null, 2),
        '',
      );
    }

    contextParts.push(...renderBenchmarkProfileDirectionSection({
      heading: '## Benchmark Profile Direction',
      sharedContext,
    }));

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Available Evidence Items (use as hooks)',
        sharedInventory: sharedContext?.evidenceInventory,
        maxItems: 15,
      }));
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Available Evidence Items (use as hooks)',
        legacyEvidence: platformContext.evidence_items,
        maxItems: 15,
      }));
    }

    contextParts.push(
      `Generate exactly ${count} topic suggestions. Each must:`,
      '- Be rooted in a real experience or accomplishment from their evidence',
      '- Position them as a thought leader, not a generic advice giver',
      '- Have a specific, attention-grabbing hook that will stop the scroll',
      '- Be achievable in a focused 250-word article/post or a sparse carousel',
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

// --- Tool: present_topics ----------------------------------------------

const presentTopicsTool: LinkedInContentTool = {
  name: 'present_topics',
  description:
    'Emits the topics_ready SSE event to present the generated topic suggestions ' +
    'to the user for selection. No LLM call -- just formats and emits. ' +
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
      return { success: false, reason: 'No topics to present -- call suggest_topics first' };
    }

    ctx.emit({
      type: 'topics_ready',
      session_id: state.session_id,
      topics,
    });

    return { presented: true, topic_count: topics.length };
  },
};

// --- Tool: plan_series -------------------------------------------------

const planSeriesTool: LinkedInContentTool = {
  name: 'plan_series',
  description:
    'Plans a 12-16 post thought leadership series rooted in the user\'s signature ' +
    'strengths, career themes, and evidence inventory. The series tells a cohesive story ' +
    'across all posts -- each post stands alone but threads into a shared narrative arc. ' +
    'Mixes post categories: foundation, deep_dive, case_study, contrarian, vision. ' +
    'Every post is backed by real experience from the user\'s evidence library. ' +
    'Stores the series plan in scratchpad.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      post_count: {
        type: 'number',
        description: 'Number of posts in the series. Must be between 12 and 16. Default: 14.',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const postCount = typeof input.post_count === 'number'
      ? Math.min(16, Math.max(12, input.post_count))
      : 14;

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Planning a ${postCount}-part thought leadership series...`,
    });

    const expertiseAnalysis = ctx.scratchpad.expertise_analysis as Record<string, unknown> | undefined;
    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;

    const contextParts: string[] = [
      `Plan a ${postCount}-post thought leadership series for this executive.`,
      'The series must tell a cohesive story -- each post stands alone but connects to the thread.',
      '',
    ];

    if (expertiseAnalysis) {
      contextParts.push(
        '## Expertise Analysis',
        JSON.stringify(expertiseAnalysis, null, 2),
        '',
      );
    }

    if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy',
        sharedStrategy: sharedContext?.positioningStrategy,
      }));
    } else if (platformContext?.positioning_strategy) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy',
        legacyStrategy: platformContext.positioning_strategy,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Inventory (root every post in specific evidence)',
        sharedInventory: sharedContext?.evidenceInventory,
        maxItems: 15,
      }));
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Inventory (root every post in specific evidence)',
        legacyEvidence: platformContext.evidence_items,
        maxItems: 15,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## Career Narrative (the authentic voice and career arc)',
        sharedNarrative: sharedContext?.careerNarrative,
      }));
    } else if (platformContext?.career_narrative) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## Career Narrative (the authentic voice and career arc)',
        legacyNarrative: platformContext.career_narrative,
      }));
    }

    // Why Me story gives the series its invisible thread
    const whyMeStory = (sharedContext as Record<string, unknown> | undefined)?.why_me_story
      ?? (platformContext as Record<string, unknown> | undefined)?.why_me_story;
    if (whyMeStory) {
      contextParts.push(...renderWhyMeStorySection({
        heading: '## Why Me Story (the invisible thread through the series)',
        legacyWhyMeStory: whyMeStory,
      }));
    }

    contextParts.push(
      '',
      '## Series Design Requirements',
      `- Exactly ${postCount} posts`,
      '- Each post must stand alone as a useful read, but also reference the series arc',
      '- Mix of categories across the series: foundation (1-2), deep_dive (4-6), case_study (3-4), contrarian (1-2), vision (1-2)',
      '- Every post must be backed by a specific evidence item from the inventory above',
      '- Each planned text post should be executable as a focused ~250-word LinkedIn blog/post, not a sprawling article',
      '- Carousel-ready topics should be reducible to sparse slides with only a few words per slide',
      '- The series arc should describe an intellectual journey: problem -> framework -> proof -> future',
      '- Posts should build on each other naturally, not feel like a random list',
      '- The series title should be memorable and position the author as THE expert in this domain',
      '',
      'Return ONLY valid JSON matching this exact structure:',
      `{
  "series_title": "The [Domain] Leader's [Something]",
  "series_theme": "The overarching insight or argument that runs through all posts",
  "total_posts": ${postCount},
  "target_audience": "Who reads this series and what they get from it",
  "series_arc": "How the series builds: 'Starts with X, moves through Y, culminates in Z'",
  "posts": [
    {
      "post_number": 1,
      "title": "Specific title for this post",
      "hook": "The exact opening line (must stop the scroll as a standalone post)",
      "key_points": ["point 1", "point 2", "point 3"],
      "evidence_source": "Which specific evidence item or experience backs this post",
      "cta": "The closing question or invitation to engage",
      "category": "foundation"
    }
  ]
}`,
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 8192,
      system:
        'You are a LinkedIn thought leadership strategist for senior executives. You design ' +
        'content series that systematically build authority in a domain -- not generic content ' +
        'calendars, but cohesive arguments that unfold over weeks. Every post must be ' +
        'grounded in the executive\'s specific experience. ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: contextParts.join('\n'),
        },
      ],
    });

    const raw = response.text ?? '{}';
    let series: ContentSeries;

    try {
      const parsed = repairJSON<ContentSeries>(raw);
      if (!parsed || !Array.isArray(parsed.posts) || parsed.posts.length === 0) {
        throw new Error('Invalid series structure');
      }
      series = parsed;
    } catch {
      // Graceful fallback -- empty series that the user can see failed
      series = {
        series_title: 'Executive Thought Leadership Series',
        series_theme: 'Sharing hard-won expertise from a career at the top of the field',
        total_posts: postCount,
        target_audience: 'Senior professionals navigating similar challenges',
        series_arc: 'Foundations -> Deep dives -> Case studies -> Vision',
        posts: [],
      };
    }

    // Enforce post_number sequencing and valid category values
    const validCategories = new Set<SeriesPost['category']>(['foundation', 'deep_dive', 'case_study', 'contrarian', 'vision']);
    series.posts = series.posts.map((p, i) => ({
      ...p,
      post_number: i + 1,
      category: validCategories.has(p.category) ? p.category : 'deep_dive',
    }));

    ctx.scratchpad.series_plan = series;
    ctx.updateState({ series_plan: series });

    return { series_title: series.series_title, total_posts: series.posts.length };
  },
};

// --- Tool: present_series ----------------------------------------------

const presentSeriesTool: LinkedInContentTool = {
  name: 'present_series',
  description:
    'Emits the series_plan_ready SSE event to present the full series plan to the user ' +
    'for review and approval before writing begins. No LLM call -- just formats and emits. ' +
    'Call this after plan_series.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const series = (ctx.scratchpad.series_plan ?? state.series_plan) as ContentSeries | undefined;

    if (!series || !Array.isArray(series.posts) || series.posts.length === 0) {
      return { success: false, reason: 'No series plan to present -- call plan_series first' };
    }

    ctx.emit({
      type: 'series_plan_ready',
      session_id: state.session_id,
      series,
    });

    return { presented: true, total_posts: series.posts.length };
  },
};

// --- Tool: suggest_interview_authority_topics --------------------------

const suggestInterviewAuthorityTopicsTool: LinkedInContentTool = {
  name: 'suggest_interview_authority_topics',
  description:
    'Identifies 5 hard interview questions for the user\'s target role, then maps each ' +
    'question to specific evidence from their resume and experience library. Each question ' +
    'becomes a carousel post topic — the user answers it from their real experience, ' +
    'positioning themselves as an authority before the interview happens. ' +
    'Returns topics in the same format as suggest_topics. Stores in scratchpad.',
  model_tier: 'primary',
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
      message: 'Identifying the hardest interview questions for your target role...',
    });

    const expertiseAnalysis = ctx.scratchpad.expertise_analysis as Record<string, unknown> | undefined;
    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;

    const contextParts: string[] = [
      'You are designing Interview Authority carousel posts for a LinkedIn content strategy.',
      '',
      'Your task: Identify the 5 hardest, most differentiating interview questions for this person\'s target role, then map each question to specific evidence from their background.',
      '',
      'These are NOT generic behavioral questions. They are the questions where weak candidates give vague answers — and where this person can give concrete, specific answers that make them stand out.',
      '',
    ];

    if (expertiseAnalysis) {
      contextParts.push(
        '## Expertise & Positioning',
        JSON.stringify(expertiseAnalysis, null, 2),
        '',
      );
    }

    if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy (understand their target role and differentiation)',
        sharedStrategy: sharedContext?.positioningStrategy,
      }));
    } else if (platformContext?.positioning_strategy) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy (understand their target role and differentiation)',
        legacyStrategy: platformContext.positioning_strategy,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Library (map each question to real evidence)',
        sharedInventory: sharedContext?.evidenceInventory,
        maxItems: 15,
      }));
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Library (map each question to real evidence)',
        legacyEvidence: platformContext.evidence_items,
        maxItems: 15,
      }));
    }

    contextParts.push(
      '',
      '## Output Requirements',
      '',
      'Return exactly 5 interview questions. For each:',
      '- The question must be hard — the kind that separates strong candidates from weak ones',
      '- The question must be answerable by this specific person (based on their evidence)',
      '- The hook must sound like this person starting to answer the question — specific, confident, from experience',
      '- The rationale must explain which JD requirement or role challenge this question probes',
      '- evidence_refs must point to specific items from their evidence library',
      '- The resulting carousel should be sparse and skimmable: one answer idea per slide, only a few words per slide',
      '',
      'Question categories to draw from:',
      '- Scale/scope questions: "Tell me about the largest [X] you\'ve managed"',
      '- Failure/recovery questions: "Tell me about a time you had to recover from [hard situation]"',
      '- Conflict/stakeholder questions: "How do you handle [politically difficult scenario]"',
      '- Domain-specific deep dives: "Walk me through how you approach [key domain challenge]"',
      '- Vision/transformation questions: "How would you [transform/rebuild/fix] [something]"',
      '',
      'Return ONLY valid JSON array:',
      `[
  {
    "id": "iq-1",
    "topic": "The interview question itself, exactly as an interviewer would ask it",
    "hook": "The first line of this person's answer — specific, grounded, from real experience",
    "rationale": "Why this question is hard for most candidates, and what requirement or role challenge it probes",
    "expertise_area": "The domain this question tests (e.g. 'operations_leadership', 'financial_turnaround')",
    "evidence_refs": ["Specific evidence item from their library that backs their answer"]
  }
]`,
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system:
        'You are a senior executive interview coach. You know which questions separate truly strong candidates from ' +
        'the pack, and you know how to map a candidate\'s evidence to those questions so their answers are specific and credible. ' +
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
      topics = [
        {
          id: 'iq-1',
          topic: 'Tell me about the largest operational transformation you have led.',
          hook: 'The first time I was handed a plant that was hemorrhaging $2M/month, I had 90 days to turn it around.',
          rationale: 'Tests depth of operational experience and comfort with high-stakes accountability.',
          expertise_area: 'operations_leadership',
          evidence_refs: [],
        },
      ];
    }

    // Enforce id prefix for interview authority topics
    topics = topics.map((t, i) => ({
      ...t,
      id: t.id?.startsWith('iq-') ? t.id : `iq-${i + 1}`,
    }));

    ctx.scratchpad.suggested_topics = topics;
    ctx.updateState({ suggested_topics: topics });

    return { topics, count: topics.length };
  },
};

// --- Tool exports ------------------------------------------------------

export const strategistTools: LinkedInContentTool[] = [
  analyzeExpertiseTool,
  suggestTopicsTool,
  presentTopicsTool,
  planSeriesTool,
  presentSeriesTool,
  suggestInterviewAuthorityTopicsTool,
  createEmitTransparency<LinkedInContentState, LinkedInContentSSEEvent>({ prefix: 'Strategist: ' }),
];
