/**
 * LinkedIn Content Writer -- Tool definitions.
 *
 * 5 tools:
 * - write_post: Drafts full LinkedIn post. In series mode, adds series context,
 *   "Part X of Y" framing, callback to previous post, and teaser for next.
 * - self_review_post: Checks authenticity, engagement, keyword density
 * - revise_post: Revises based on user feedback
 * - present_post: Emits post_draft_ready SSE event
 * - emit_transparency: Shared transparency tool
 */

import type { LinkedInContentTool, PostQualityScores } from '../types.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { LinkedInContentState, LinkedInContentSSEEvent } from '../types.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';

// ─── Helper: build series context block ──────────────────────────────────

/**
 * Builds the series context block injected into the write_post prompt when
 * the writer is working on a post that is part of a series.
 *
 * This gives the LLM everything it needs to:
 * - Write a post that stands alone but fits the series narrative
 * - Reference the previous post's theme naturally
 * - Tease the next post without spoiling it
 * - Keep the series arc visible to the reader
 */
function buildSeriesContext(state: LinkedInContentState): string {
  const series = state.series_plan;
  const postNum = state.current_series_post ?? 1;

  if (!series || !Array.isArray(series.posts)) return '';

  const thisPost = series.posts.find((p) => p.post_number === postNum);
  if (!thisPost) return '';

  const prevPost = series.posts.find((p) => p.post_number === postNum - 1);
  const nextPost = series.posts.find((p) => p.post_number === postNum + 1);

  const lines: string[] = [
    '## Series Context',
    `**Series title:** ${series.series_title}`,
    `**Series theme:** ${series.series_theme}`,
    `**Series arc:** ${series.series_arc}`,
    `**Target audience:** ${series.target_audience}`,
    `**This post:** Part ${postNum} of ${series.total_posts}`,
    '',
    `### This Post Blueprint (Post ${postNum}: ${thisPost.title})`,
    `**Category:** ${thisPost.category}`,
    `**Hook:** ${thisPost.hook}`,
    `**Key points:**`,
    ...thisPost.key_points.map((p) => `- ${p}`),
    `**Evidence source:** ${thisPost.evidence_source}`,
    `**CTA:** ${thisPost.cta}`,
  ];

  if (prevPost) {
    lines.push(
      '',
      `### Previous Post (Part ${prevPost.post_number}: ${prevPost.title})`,
      `Theme: ${prevPost.hook}`,
      'Reference this naturally -- one sentence that connects this post to the thread established in the previous one.',
    );
  }

  if (nextPost) {
    lines.push(
      '',
      `### Next Post (Part ${nextPost.post_number}: ${nextPost.title})`,
      `Theme: ${nextPost.hook}`,
      'End with a brief, organic teaser for what\'s coming next in the series -- one sentence, not a promotional announcement.',
    );
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Helper: build series-aware post requirements ────────────────────────

function buildPostRequirements(state: LinkedInContentState, isRevision: boolean): string[] {
  const isSeries = state.series_mode && state.series_plan;
  const postNum = state.current_series_post ?? 1;
  const total = state.series_plan?.total_posts ?? 1;

  const requirements: string[] = [
    '## Post Requirements',
    '- Hook (first 1-2 lines): Must stop the scroll as a STANDALONE post, not dependent on prior series knowledge.',
    '- Body: Short paragraphs with intentional white space. One core idea per paragraph.',
    '- Use line breaks after every 1-3 sentences. LinkedIn rewards visual scannability.',
    '- CTA: End with a genuine question that invites disagreement or experience-sharing.',
    '- Hashtags: 3-5 relevant hashtags, placed at the end.',
    '- Total length: 800-1200 words. This is substantial -- longer than a typical post. Develop the idea fully.',
    '- Voice: Sound like a practitioner sharing hard-won insight, not a content creator.',
    '- Be specific: name companies, projects, dollar figures, team sizes where relevant.',
  ];

  if (isSeries) {
    requirements.push(
      '',
      '## Series-Specific Requirements',
      `- Include "Part ${postNum} of ${total}: ${state.series_plan?.series_title}" as a subtitle or natural reference near the top.`,
      '- The post must stand fully alone -- a reader encountering it outside the series should find complete value.',
      '- Include one natural callback to the previous post\'s theme (if this is not post 1).',
      '- End with one sentence teaser for the next post (if this is not the final post).',
      '- The series theme should be the invisible backbone, not an explicit repeated announcement.',
    );
  }

  if (isRevision) {
    requirements.push(
      '',
      '## Revision Note',
      'This is a revision. Address the feedback precisely. Do not rewrite sections that were not flagged.',
    );
  }

  requirements.push(
    '',
    'Return ONLY valid JSON:',
    '{',
    '  "post": "The full post text including line breaks (use \\n for newlines)",',
    '  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],',
    '  "hook_explanation": "Why this hook will stop the scroll"',
    '}',
  );

  return requirements;
}

// ─── Tool: write_post ─────────────────────────────────────────────

const writePostTool: LinkedInContentTool = {
  name: 'write_post',
  description:
    'Drafts a full LinkedIn post (800-1200 words) with hook, body, CTA, and hashtags. ' +
    'In series mode, incorporates series context: "Part X of Y" reference, callback to ' +
    'the previous post\'s theme, and teaser for the next. Stores draft in scratchpad.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The topic or angle for the post',
      },
      style: {
        type: 'string',
        enum: ['story', 'insight', 'question', 'contrarian'],
        description: 'Post style: story (narrative arc), insight (lesson learned), question (thought-provoking), contrarian (challenges conventional wisdom). Default: insight',
      },
    },
    required: ['topic'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const isSeries = state.series_mode && state.series_plan;

    // In series mode, derive topic from the series post blueprint
    let topic: string;
    if (isSeries) {
      const postNum = state.current_series_post ?? 1;
      const seriesPost = state.series_plan?.posts.find((p) => p.post_number === postNum);
      topic = seriesPost?.title ?? String(input.topic ?? state.selected_topic ?? '');
    } else {
      topic = String(input.topic ?? state.selected_topic ?? '');
    }

    const style = String(input.style ?? 'insight');

    if (!topic) {
      return { success: false, reason: 'No topic provided -- include topic parameter or set selected_topic on state' };
    }

    const postNum = state.current_series_post;
    const totalPosts = state.series_plan?.total_posts;
    const progressLabel = isSeries && postNum && totalPosts
      ? ` (Part ${postNum} of ${totalPosts})`
      : '';

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Writing your LinkedIn post${progressLabel}: ${topic.slice(0, 60)}...`,
    });

    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;
    const contextParts: string[] = [
      `Write a LinkedIn post on this topic: "${topic}"`,
      `Style: ${style}`,
      '',
    ];

    // Series context block -- present only in series mode
    if (isSeries) {
      contextParts.push(buildSeriesContext(state));
    }

    if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## User\'s Career Narrative (match their authentic voice)',
        sharedNarrative: sharedContext?.careerNarrative,
      }));
    } else if (platformContext?.career_narrative) {
      contextParts.push(...renderCareerNarrativeSection({
        heading: '## User\'s Career Narrative (match their authentic voice)',
        legacyNarrative: platformContext.career_narrative,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy (ensure post reinforces this)',
        sharedStrategy: sharedContext?.positioningStrategy,
      }));
    } else if (platformContext?.positioning_strategy) {
      contextParts.push(...renderPositioningStrategySection({
        heading: '## Positioning Strategy (ensure post reinforces this)',
        legacyStrategy: platformContext.positioning_strategy,
      }));
    }

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Items (use specific metrics and stories from here)',
        sharedInventory: sharedContext?.evidenceInventory,
        maxItems: 15,
      }));
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      contextParts.push(...renderEvidenceInventorySection({
        heading: '## Evidence Items (use specific metrics and stories from here)',
        legacyEvidence: platformContext.evidence_items,
        maxItems: 15,
      }));
    }

    contextParts.push(...buildPostRequirements(state, false));

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 6144,
      system:
        'You are a LinkedIn ghostwriter for executives. You write posts in the executive\'s authentic ' +
        'voice -- specific, direct, and rooted in real experience. You never use buzzwords, vague ' +
        'platitudes, or generic advice. Every post earns its read. ' +
        'In series mode, each post must stand alone while threading into the series narrative. ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: contextParts.join('\n'),
        },
      ],
    });

    const raw = response.text ?? '{}';
    let parsed: Record<string, unknown>;

    try {
      parsed = repairJSON<Record<string, unknown>>(raw) ?? {};
    } catch {
      parsed = {
        post: raw.slice(0, 3000),
        hashtags: ['#Leadership', '#ExecutiveInsights'],
        hook_explanation: 'Direct opening',
      };
    }

    const postText = String(parsed.post ?? '');
    const hashtags = Array.isArray(parsed.hashtags)
      ? (parsed.hashtags as unknown[]).map(String)
      : ['#Leadership'];

    ctx.scratchpad.post_draft = postText;
    ctx.scratchpad.post_hashtags = hashtags;

    return { post: postText, hashtags, hook_explanation: parsed.hook_explanation };
  },
};

// ─── Tool: self_review_post ────────────────────────────────────────────

const selfReviewPostTool: LinkedInContentTool = {
  name: 'self_review_post',
  description:
    'Reviews the drafted post for authenticity (no buzzwords, genuine voice), ' +
    'engagement potential (hook strength, readability), and keyword density for ' +
    'discoverability. Returns quality scores (0-100). Stores scores in scratchpad.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const postDraft = String(ctx.scratchpad.post_draft ?? '');

    if (!postDraft) {
      return { success: false, reason: 'No post draft -- call write_post first' };
    }

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: 'Reviewing post for authenticity and engagement quality...',
    });

    const hookText = postDraft.slice(0, 210);

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 1024,
      system:
        'You review LinkedIn posts for quality. Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: `Review this LinkedIn post and return quality scores:

## Post
${postDraft}

## Hook (first 210 characters -- what shows before "see more")
${hookText}

Evaluate and return:
{
  "authenticity": 75,
  "engagement_potential": 80,
  "keyword_density": 65,
  "authenticity_notes": "specific feedback on voice and buzzword usage",
  "engagement_notes": "specific feedback on hook, scannability, CTA",
  "keyword_notes": "specific feedback on industry keyword coverage",
  "hook_type": "contrarian|specific_number|story_opener|direct_challenge|vulnerable_admission|other",
  "hook_score": 0-100,
  "hook_assessment": "one sentence on why this hook works or how to improve it"
}

Scoring guide:
- authenticity: 90+ = genuinely specific, no buzzwords. 70-89 = mostly genuine. <70 = generic/buzzword-heavy.
- engagement_potential: 90+ = strong hook + scannable + clear CTA. 70-89 = good but improvable. <70 = weak hook or poor structure.
- keyword_density: 90+ = excellent industry coverage. 70-89 = good. <70 = missing key terms.
- hook_score: 90+ = stops the scroll immediately. 70-89 = compelling but improvable. <70 = weak -- generic opener, buried lead, or no curiosity gap.
- hook_type examples: contrarian = "Most execs do X backwards". specific_number = "3 things I learned from a $40M turnaround". story_opener = "The day I walked into a plant losing $2M/month...". direct_challenge = "Your supply chain isn't as resilient as you think". vulnerable_admission = "I made a $10M mistake at 42."`,
        },
      ],
    });

    const raw = response.text ?? '{}';
    let scores: PostQualityScores & Record<string, unknown>;

    try {
      scores = (repairJSON<PostQualityScores>(raw) ?? {}) as PostQualityScores & Record<string, unknown>;
    } catch {
      scores = { authenticity: 75, engagement_potential: 75, keyword_density: 70 };
    }

    const qualityScores: PostQualityScores = {
      authenticity: typeof scores.authenticity === 'number' ? scores.authenticity : 75,
      engagement_potential: typeof scores.engagement_potential === 'number' ? scores.engagement_potential : 75,
      keyword_density: typeof scores.keyword_density === 'number' ? scores.keyword_density : 70,
    };

    // Hook analysis -- persisted for display in post review UI
    const hookScore = typeof scores.hook_score === 'number' ? scores.hook_score : null;
    const hookType = typeof scores.hook_type === 'string' ? scores.hook_type : null;
    const hookAssessment = typeof scores.hook_assessment === 'string' ? scores.hook_assessment : null;

    ctx.scratchpad.quality_scores = qualityScores;
    ctx.scratchpad.hook_score = hookScore;
    ctx.scratchpad.hook_type = hookType;
    ctx.scratchpad.hook_assessment = hookAssessment;

    return {
      quality_scores: qualityScores,
      hook_score: hookScore,
      hook_type: hookType,
      hook_assessment: hookAssessment,
      notes: {
        authenticity: scores.authenticity_notes,
        engagement: scores.engagement_notes,
        keywords: scores.keyword_notes,
      },
    };
  },
};

// ─── Tool: revise_post ─────────────────────────────────────────────

const revisePostTool: LinkedInContentTool = {
  name: 'revise_post',
  description:
    'Revises the post based on user feedback. Can find specific evidence from platform ' +
    'context if the user requests it. Preserves series context in series mode. Updates draft in scratchpad.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      feedback: {
        type: 'string',
        description: 'User feedback describing what to change in the post',
      },
    },
    required: ['feedback'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const feedback = String(input.feedback ?? '');
    const currentDraft = String(ctx.scratchpad.post_draft ?? '');
    const currentHashtags = (ctx.scratchpad.post_hashtags as string[]) ?? [];

    if (!currentDraft) {
      return { success: false, reason: 'No post draft to revise -- call write_post first' };
    }

    if (!feedback) {
      return { success: false, reason: 'No feedback provided' };
    }

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: 'Revising post based on your feedback...',
    });

    const platformContext = state.platform_context;
    const sharedContext = state.shared_context;
    const revisionParts: string[] = [
      'Revise this LinkedIn post based on the user feedback.',
      '',
      '## Current Post',
      currentDraft,
      '',
      '## User Feedback',
      feedback,
    ];

    // In series mode, re-include series context so the revision stays coherent
    if (state.series_mode && state.series_plan) {
      revisionParts.push('', buildSeriesContext(state));
    }

    if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)) {
      revisionParts.push(
        '',
        ...renderEvidenceInventorySection({
          heading: '## Available Evidence (use if user requests specific examples)',
          sharedInventory: sharedContext?.evidenceInventory,
          maxItems: 15,
        }),
      );
    } else if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
      revisionParts.push(
        '',
        ...renderEvidenceInventorySection({
          heading: '## Available Evidence (use if user requests specific examples)',
          legacyEvidence: platformContext.evidence_items,
          maxItems: 15,
        }),
      );
    }

    revisionParts.push(
      '',
      'Return ONLY valid JSON:',
      '{',
      '  "post": "The revised full post text",',
      '  "hashtags": ["hashtag1", "hashtag2"],',
      '  "revision_notes": "What was changed and why"',
      '}',
    );

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 6144,
      system:
        'You revise LinkedIn posts for executives based on their feedback. Keep the authentic voice ' +
        'and any series continuity elements (Part X reference, callbacks, teasers). ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: revisionParts.join('\n'),
        },
      ],
    });

    const raw = response.text ?? '{}';
    let parsed: Record<string, unknown>;

    try {
      parsed = repairJSON<Record<string, unknown>>(raw) ?? {};
    } catch {
      parsed = { post: currentDraft, hashtags: currentHashtags };
    }

    const postText = String(parsed.post ?? currentDraft);
    const hashtags = Array.isArray(parsed.hashtags)
      ? (parsed.hashtags as unknown[]).map(String)
      : currentHashtags;

    ctx.scratchpad.post_draft = postText;
    ctx.scratchpad.post_hashtags = hashtags;
    ctx.scratchpad.revision_notes = parsed.revision_notes;

    // Re-review after revision
    ctx.updateState({ revision_feedback: feedback });

    return { post: postText, hashtags, revision_notes: parsed.revision_notes };
  },
};

// ─── Tool: present_post ────────────────────────────────────────────────

const presentPostTool: LinkedInContentTool = {
  name: 'present_post',
  description:
    'Emits the post_draft_ready SSE event to present the post draft to the user. ' +
    'In series mode, includes the current post number and series total so the UI ' +
    'can show "Part X of Y" progress. No LLM call -- just formats and emits. ' +
    'Call this after self_review_post.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const postDraft = String(ctx.scratchpad.post_draft ?? '');
    const hashtags = (ctx.scratchpad.post_hashtags as string[]) ?? [];
    const qualityScores = (ctx.scratchpad.quality_scores as PostQualityScores) ?? {
      authenticity: 75,
      engagement_potential: 75,
      keyword_density: 70,
    };
    const hookScore = (ctx.scratchpad.hook_score as number | null) ?? null;
    const hookType = (ctx.scratchpad.hook_type as string | null) ?? null;
    const hookAssessment = (ctx.scratchpad.hook_assessment as string | null) ?? null;

    if (!postDraft) {
      return { success: false, reason: 'No post draft to present -- call write_post first' };
    }

    const seriesPostNumber = state.series_mode ? (state.current_series_post ?? undefined) : undefined;
    const seriesTotal = state.series_mode ? (state.series_plan?.total_posts ?? undefined) : undefined;

    ctx.emit({
      type: 'post_draft_ready',
      session_id: state.session_id,
      post: postDraft,
      hashtags,
      quality_scores: qualityScores,
      hook_score: hookScore,
      hook_type: hookType,
      hook_assessment: hookAssessment,
      series_post_number: seriesPostNumber,
      series_total: seriesTotal,
    });

    return { presented: true };
  },
};

// ─── Tool exports ──────────────────────────────────────────────────────

export const writerTools: LinkedInContentTool[] = [
  writePostTool,
  selfReviewPostTool,
  revisePostTool,
  presentPostTool,
  createEmitTransparency<LinkedInContentState, LinkedInContentSSEEvent>({ prefix: 'Writer: ' }),
];
