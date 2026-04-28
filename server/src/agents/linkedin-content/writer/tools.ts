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
  renderBenchmarkProfileDirectionSection,
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import { buildCarouselSlides } from '../../../lib/carousel-builder.js';
import logger from '../../../lib/logger.js';

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

const BLOG_WORD_MIN = 200;
const BLOG_WORD_TARGET = 250;
const BLOG_WORD_MAX = 300;

const AI_FILLER_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'rapidly evolving landscape', pattern: /\bin today'?s (?:fast-paced|rapidly evolving|ever-changing) (?:world|landscape|environment)\b/i },
  { label: 'not just about', pattern: /\bit'?s not (?:just )?about\b/i },
  { label: 'more important than ever', pattern: /\bmore important than ever\b/i },
  { label: 'game-changer', pattern: /\bgame[- ]changer\b/i },
  { label: 'unlock potential', pattern: /\bunlock(?:ing)? (?:the )?(?:power|potential)\b/i },
  { label: 'drive success', pattern: /\bdrive (?:meaningful )?success\b/i },
  { label: 'delve', pattern: /\bdelve\b/i },
  { label: 'leverage', pattern: /\bleverage\b/i },
  { label: 'thought leader filler', pattern: /\bthought leader(?:ship)?\b/i },
];

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function findAIFiller(text: string): string[] {
  return AI_FILLER_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

function estimateHookScore(hookText: string): number {
  const hook = hookText.trim();
  if (!hook) return 35;

  let score = 72;
  if (hook.length > 210) score -= 15;
  if (hook.length < 35) score -= 10;
  if (/\d/.test(hook)) score += 8;
  if (/\bI\b|\bwe\b|\bmy\b|\bour\b/i.test(hook)) score += 6;
  if (/[?!]/.test(hook)) score += 4;
  if (/^(I'?m excited|Happy Monday|Here'?s a thought|In today'?s)/i.test(hook)) score -= 25;
  if (findAIFiller(hook).length > 0) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function normalizeHashtags(raw: unknown, fallback: string[] = ['#Leadership']): string[] {
  const source = Array.isArray(raw) ? raw.map(String) : fallback;
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of source) {
    const cleaned = tag.trim().replace(/\s+/g, '');
    if (!cleaned) continue;
    const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`;
    const key = withHash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(withHash);
    if (normalized.length >= 5) break;
  }

  return normalized.length > 0 ? normalized : fallback;
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
    `- Blog/post length: target about ${BLOG_WORD_TARGET} words. Acceptable range: ${BLOG_WORD_MIN}-275 words. Never exceed ${BLOG_WORD_MAX} words. Develop one idea fully, then stop.`,
    '- Character guidance: 1,000-1,300 characters is ideal when it fits the word contract, but the 300-word maximum wins.',
    '- Voice: Sound like a practitioner sharing hard-won insight, not a content creator.',
    '- Be specific: name companies, projects, dollar figures, team sizes where relevant.',
    '- Avoid AI filler phrases, generic thought-leadership language, and inspirational slogans. Use concrete operating detail instead.',
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
    'Drafts a full LinkedIn post/blog-style article around 250 words with hook, body, CTA, and hashtags. ' +
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

    contextParts.push(...renderBenchmarkProfileDirectionSection({
      heading: '## Benchmark Profile Direction',
      sharedContext,
    }));

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

    let postText = String(parsed.post ?? '');
    const hashtags = normalizeHashtags(parsed.hashtags);

    // 360Brew length enforcement for text posts, now aligned to the product's
    // ~250-word blog/post contract.
    const charCount = postText.length;
    let lengthNote: string | undefined;
    const initialWordCount = countWords(postText);
    if (initialWordCount < 150) {
      lengthNote = `Post is ${initialWordCount} words — below the 200-275 word target. Consider expanding with more specific evidence or a deeper development of the main idea.`;
      logger.warn({ wordCount: initialWordCount, topic }, 'linkedin-content: write_post below target word count');
    } else if (initialWordCount > BLOG_WORD_MAX) {
      lengthNote = `Post is ${initialWordCount} words — above the ${BLOG_WORD_MAX}-word maximum. Consider tightening to one idea with stronger proof.`;
      logger.warn({ wordCount: initialWordCount, topic }, 'linkedin-content: write_post above maximum word count');
    }

    if (charCount < 800) {
      lengthNote ??= `Post is ${charCount} characters — below the 360Brew minimum of 1,000. Consider expanding with more specific evidence or a deeper development of the main idea.`;
      logger.warn({ charCount, topic }, 'linkedin-content: write_post below 360Brew minimum length');
    } else if (charCount > 1500) {
      // Truncate at the last complete sentence before 1,300 characters
      const target = postText.slice(0, 1300);
      const lastPeriod = Math.max(
        target.lastIndexOf('. '),
        target.lastIndexOf('.\n'),
        target.lastIndexOf('! '),
        target.lastIndexOf('!\n'),
        target.lastIndexOf('? '),
        target.lastIndexOf('?\n'),
      );
      if (lastPeriod > 800) {
        postText = postText.slice(0, lastPeriod + 1).trimEnd();
        lengthNote = `Post was ${charCount} characters — trimmed to ${postText.length} to stay within the 360Brew optimal range (1,000–1,300).`;
        logger.info({ originalLength: charCount, trimmedLength: postText.length }, 'linkedin-content: write_post trimmed to 360Brew optimal length');
      }
    }

    const fillerHits = findAIFiller(postText);
    if (fillerHits.length > 0) {
      logger.warn({ fillerHits, topic }, 'linkedin-content: write_post contains generic AI-style filler');
    }

    // 360Brew carousel slide count check (applies when content is a carousel)
    const carouselFormat = state.carousel_format;
    if ((carouselFormat === 'carousel' || carouselFormat === 'both') && state.carousel_slides) {
      const slideCount = state.carousel_slides.length;
      if (slideCount < 8 || slideCount > 12) {
        logger.warn({ slideCount }, 'linkedin-content: carousel slide count outside 360Brew optimal range (8-12)');
      }
    }

    ctx.scratchpad.post_draft = postText;
    ctx.scratchpad.post_hashtags = hashtags;

    return { post: postText, hashtags, hook_explanation: parsed.hook_explanation, length_note: lengthNote };
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
    const wc = countWords(postDraft);
    const fillerHits = findAIFiller(postDraft);

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

## Deterministic Checks
Word count: ${wc}
Target: ${BLOG_WORD_MIN}-275 words, ideal about ${BLOG_WORD_TARGET}, never over ${BLOG_WORD_MAX}.
AI-style filler detected: ${fillerHits.length > 0 ? fillerHits.join(', ') : 'none'}

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
- Posts under 150 words or over 300 words should score below 75 on engagement even if well written.
- Any AI-style filler phrase should score below 70 on authenticity unless the rest of the post is extremely specific.
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

    if (fillerHits.length > 0) {
      qualityScores.authenticity = Math.min(qualityScores.authenticity, 65);
    }
    if (wc < 150 || wc > BLOG_WORD_MAX) {
      qualityScores.engagement_potential = Math.min(qualityScores.engagement_potential, 70);
    } else if (wc < BLOG_WORD_MIN || wc > 275) {
      qualityScores.engagement_potential = Math.min(qualityScores.engagement_potential, 82);
    }

    // Hook analysis -- persisted for display in post review UI
    const estimatedHookScore = estimateHookScore(hookText);
    const hookScore = typeof scores.hook_score === 'number'
      ? Math.min(Math.max(Math.round(scores.hook_score), 0), 100)
      : estimatedHookScore;
    if (hookScore < 70) {
      qualityScores.engagement_potential = Math.min(qualityScores.engagement_potential, 68);
    }
    const hookType = typeof scores.hook_type === 'string' ? scores.hook_type : null;
    const hookAssessment = typeof scores.hook_assessment === 'string'
      ? scores.hook_assessment
      : `Estimated hook score: ${estimatedHookScore}. The first 210 characters should create immediate specificity, tension, or proof.`;

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
      '## Non-Negotiable Quality Standard',
      `- Keep the revised post around ${BLOG_WORD_TARGET} words (${BLOG_WORD_MIN}-275 preferred, ${BLOG_WORD_MAX} maximum).`,
      '- Keep the first 210 characters strong enough to stop the scroll before "see more".',
      '- Remove AI filler, generic thought-leadership language, and slogans.',
      '- Preserve source-grounded proof and the user\'s practitioner voice.',
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
    const hashtags = normalizeHashtags(parsed.hashtags, currentHashtags);

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

// ─── Tool: generate_carousel ───────────────────────────────────────────────

const generateCarouselTool: LinkedInContentTool = {
  name: 'generate_carousel',
  description:
    'Convert the drafted post into a multi-slide document carousel for LinkedIn. ' +
    'Slides should use sparse presentation copy: a short headline and only a few words per slide. ' +
    'Call this AFTER the post draft is finalized and the user has approved it. ' +
    'Emits a carousel_ready SSE event with the structured slide data.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      post_text: {
        type: 'string',
        description: 'The finalized post text to convert into slides',
      },
      topic: {
        type: 'string',
        description: 'The post topic/title used as the cover slide headline',
      },
    },
    required: ['post_text', 'topic'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const postText = String(input.post_text ?? ctx.scratchpad.post_draft ?? '');
    const topic = String(input.topic ?? state.selected_topic ?? 'Professional Insight');

    if (!postText) {
      return { success: false, reason: 'No post text provided -- pass post_text or call write_post first' };
    }

    // Derive author name from career profile if available; fall back gracefully
    const careerProfile = state.platform_context?.career_profile;
    const authorName =
      (careerProfile as Record<string, unknown> | undefined)?.name as string | undefined
      ?? 'Career Professional';

    const hashtags = (ctx.scratchpad.post_hashtags as string[] | undefined) ?? [];

    // Detect series info for cover slide framing
    const seriesInfo =
      state.series_mode && state.series_plan && state.current_series_post
        ? {
            part: state.current_series_post,
            total: state.series_plan.total_posts,
            title: state.series_plan.series_title,
          }
        : undefined;

    const slides = buildCarouselSlides(postText, topic, authorName, hashtags, { seriesInfo });

    ctx.scratchpad.carousel_slides = slides;

    ctx.emit({ type: 'carousel_ready', slides, topic });

    return { slides_generated: slides.length, format: 'carousel' };
  },
};

// ─── Tool exports ──────────────────────────────────────────────────────

export const writerTools: LinkedInContentTool[] = [
  writePostTool,
  selfReviewPostTool,
  revisePostTool,
  presentPostTool,
  generateCarouselTool,
  createEmitTransparency<LinkedInContentState, LinkedInContentSSEEvent>({ prefix: 'Writer: ' }),
];
