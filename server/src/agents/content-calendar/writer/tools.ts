/**
 * Content Calendar Writer — Tool definitions.
 *
 * 5 tools:
 * - write_post: Write a single LinkedIn post for a specific day
 * - craft_hook: Rewrite a weak hook for a specific post
 * - add_hashtags: Generate/refine hashtags for a specific post
 * - schedule_post: Assign optimal posting time and day_of_week
 * - assemble_calendar: Combine all posts into the final calendar report
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  ContentCalendarState,
  ContentCalendarSSEEvent,
  PlannedPost,
  ContentType,
  DayOfWeek,
} from '../types.js';
import { CONTENT_TYPE_LABELS } from '../types.js';
import { CONTENT_CALENDAR_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID, MODEL_LIGHT } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type ContentCalendarTool = AgentTool<ContentCalendarState, ContentCalendarSSEEvent>;

// ─── Helpers ────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildContextBlock(state: ContentCalendarState): string {
  const parts: string[] = [];

  if (state.resume_data) {
    parts.push('## Candidate Resume Data');
    parts.push(`Name: ${state.resume_data.name}`);
    parts.push(`Current Title: ${state.resume_data.current_title}`);
    parts.push(`Career Summary: ${state.resume_data.career_summary}`);
    if (state.resume_data.key_skills.length > 0) {
      parts.push(`Key Skills: ${state.resume_data.key_skills.join(', ')}`);
    }
    if (state.resume_data.key_achievements.length > 0) {
      parts.push('Key Achievements:');
      for (const a of state.resume_data.key_achievements) {
        parts.push(`- ${a}`);
      }
    }
    if (state.resume_data.work_history.length > 0) {
      parts.push('Work History:');
      for (const w of state.resume_data.work_history) {
        parts.push(`- ${w.title} at ${w.company} (${w.duration})`);
        for (const h of w.highlights) {
          parts.push(`  - ${h}`);
        }
      }
    }
  }

  if (state.target_context) {
    parts.push('\n## Target Context');
    parts.push(`Target Role: ${state.target_context.target_role}`);
    if (state.target_context.target_industry) {
      parts.push(`Target Industry: ${state.target_context.target_industry}`);
    }
    parts.push(`Seniority: ${state.target_context.target_seniority}`);
  }

  if (state.expertise_analysis) {
    parts.push('\n## Expertise Analysis');
    parts.push(`Core Expertise: ${state.expertise_analysis.core_expertise.join(', ')}`);
    parts.push(`Industries: ${state.expertise_analysis.industries.join(', ')}`);
    parts.push(`Seniority: ${state.expertise_analysis.seniority}`);
    if (state.expertise_analysis.differentiators.length > 0) {
      parts.push('Differentiators:');
      for (const d of state.expertise_analysis.differentiators) {
        parts.push(`- ${d}`);
      }
    }
    if (state.expertise_analysis.post_worthy_achievements.length > 0) {
      parts.push('Post-Worthy Achievements:');
      for (const a of state.expertise_analysis.post_worthy_achievements) {
        parts.push(`- ${a}`);
      }
    }
  }

  if (state.audience_mapping) {
    parts.push('\n## Audience Mapping');
    parts.push(`Primary Audience: ${state.audience_mapping.primary_audience}`);
    parts.push(`Secondary Audience: ${state.audience_mapping.secondary_audience}`);
    if (state.audience_mapping.audience_interests.length > 0) {
      parts.push(`Audience Interests: ${state.audience_mapping.audience_interests.join(', ')}`);
    }
    if (state.audience_mapping.pain_points.length > 0) {
      parts.push('Pain Points:');
      for (const p of state.audience_mapping.pain_points) {
        parts.push(`- ${p}`);
      }
    }
  }

  if (state.themes && state.themes.length > 0) {
    parts.push('\n## Content Themes');
    for (const theme of state.themes) {
      parts.push(`- **${theme.name}** (${theme.id}): ${theme.rationale}`);
      parts.push(`  Suggested types: ${theme.suggested_types.map(t => CONTENT_TYPE_LABELS[t]).join(', ')}`);
      parts.push(`  Keywords: ${theme.keywords.join(', ')}`);
    }
  }

  if (state.content_mix) {
    parts.push('\n## Content Mix Plan');
    parts.push(`Posts per week: ${state.content_mix.posts_per_week}`);
    parts.push(`Posting days: ${state.content_mix.posting_days.join(', ')}`);
    const dist = state.content_mix.type_distribution;
    const distEntries = Object.entries(dist) as [ContentType, number][];
    if (distEntries.length > 0) {
      parts.push('Type distribution:');
      for (const [type, pct] of distEntries) {
        parts.push(`- ${CONTENT_TYPE_LABELS[type]}: ${pct}%`);
      }
    }
    parts.push(`Rationale: ${state.content_mix.rationale}`);
  }

  const sharedNarrativeSection = renderCareerNarrativeSection({
    heading: '## Career Narrative Signals',
    sharedNarrative: state.shared_context?.careerNarrative,
  });
  if (sharedNarrativeSection.length > 0) {
    parts.push(...sharedNarrativeSection);
  } else if (state.platform_context?.why_me_story) {
    parts.push(...renderWhyMeStorySection({
      heading: '## Why-Me Story (from CareerIQ)',
      legacyWhyMeStory: state.platform_context?.why_me_story,
    }));
  }

  parts.push(...renderEvidenceInventorySection({
    heading: '## Evidence Inventory',
    sharedInventory: state.shared_context?.evidenceInventory,
    legacyEvidence: state.platform_context?.evidence_items,
    maxItems: 15,
  }));

  return parts.join('\n');
}

// ─── Tool: write_post ───────────────────────────────────────────────

const writePostTool: ContentCalendarTool = {
  name: 'write_post',
  description:
    'Write a single LinkedIn post for a specific day in the content calendar. ' +
    'Generates hook, body, CTA, hashtags, and posting_time. ' +
    'Quality scores the post (0-100). ' +
    'Call this for each day in the content plan — batch 4-5 calls per round.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      day: {
        type: 'number',
        description: 'Day number (1-30) in the content calendar',
      },
      content_type: {
        type: 'string',
        description: 'Content type for this post (thought_leadership, storytelling, engagement, industry_insight, how_to, case_study, career_lesson)',
      },
      theme_id: {
        type: 'string',
        description: 'Theme ID from the strategist themes list',
      },
    },
    required: ['day', 'content_type', 'theme_id'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const day = Number(input.day);
    const contentType = String(input.content_type) as ContentType;
    const themeId = String(input.theme_id);

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Run Strategist first.' });
    }

    ctx.emit({ type: 'post_progress', day, total_days: 30, content_type: contentType, status: 'drafting' });

    const contextBlock = buildContextBlock(state);

    // Find the theme for additional context
    const theme = state.themes?.find(t => t.id === themeId);
    const themeContext = theme
      ? `\nThis post's theme: "${theme.name}" — ${theme.rationale}\nTheme keywords: ${theme.keywords.join(', ')}`
      : '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a LinkedIn content writer for senior executives (45+).

${CONTENT_CALENDAR_RULES}

You have the following data about the executive:

${contextBlock}`,
      messages: [{
        role: 'user',
        content: `Write a LinkedIn post for Day ${day} of the content calendar.

Content type: ${CONTENT_TYPE_LABELS[contentType] ?? contentType}
${themeContext}

Requirements:
- Hook: 1-2 lines that stop the scroll. Use a pattern from Rule 2 (contrarian, specific number, story opener, direct challenge, observation, or vulnerable admission).
- Body: 150-300 words total (including hook). Scannable structure — short paragraphs, line breaks, optional bullets.
- CTA: End with a genuine engagement prompt — a real question, not "Thoughts?"
- Hashtags: 3-5 hashtags (1 broad, 1-2 medium, 1-2 niche). Placed at end.
- Posting time: Suggest optimal time based on Rule 5.
- Ground EVERY claim in real experience from the resume data. Never fabricate.
- Write in first person. Sound like a senior leader sharing hard-won wisdom.

Return JSON:
{
  "hook": "the first 1-2 lines (the scroll-stopper)",
  "body": "the full post body INCLUDING the hook",
  "cta": "the call-to-action line",
  "hashtags": ["#Tag1", "#Tag2", "#Tag3"],
  "posting_time": "8:00 AM EST"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      // Fallback: treat raw text as body
      const text = response.text.trim();
      result = {
        hook: text.split('\n')[0] ?? '',
        body: text,
        cta: 'What has your experience been?',
        hashtags: [],
        posting_time: '8:00 AM EST',
      };
    }

    const body = String(result.body ?? '');
    const hook = String(result.hook ?? body.split('\n')[0] ?? '');
    const cta = String(result.cta ?? '');
    const hashtags: string[] = Array.isArray(result.hashtags) ? result.hashtags.map(String) : [];
    const postingTime = String(result.posting_time ?? '8:00 AM EST');
    const wc = wordCount(body);

    // Quality scoring
    let qualityScore = 100;

    // Hook strength: penalize short or generic hooks
    if (hook.length < 30) qualityScore -= 15;
    if (/^(I'm excited|Happy Monday|Here's a thought)/i.test(hook)) qualityScore -= 20;

    // Body length: penalize outside optimal range
    if (wc < 100) qualityScore -= 20;
    else if (wc < 150) qualityScore -= 10;
    if (wc > 400) qualityScore -= 10;

    // CTA presence
    if (!cta || cta.length < 10) qualityScore -= 10;

    // Hashtag count
    if (hashtags.length < 3) qualityScore -= 10;
    if (hashtags.length > 5) qualityScore -= 5;

    qualityScore = Math.max(0, qualityScore);

    const post: PlannedPost = {
      day,
      day_of_week: 'tuesday', // placeholder — schedule_post assigns real value
      content_type: contentType,
      theme_id: themeId,
      hook,
      body,
      cta,
      hashtags,
      posting_time: postingTime,
      quality_score: qualityScore,
      word_count: wc,
    };

    // Store in state — replace if day already exists
    if (!state.posts) {
      state.posts = [];
    }
    const existingIdx = state.posts.findIndex(p => p.day === day);
    if (existingIdx >= 0) {
      state.posts[existingIdx] = post;
    } else {
      state.posts.push(post);
    }

    ctx.emit({ type: 'post_progress', day, total_days: 30, content_type: contentType, status: 'complete' });

    return JSON.stringify({
      success: true,
      day,
      content_type: contentType,
      theme_id: themeId,
      word_count: wc,
      quality_score: qualityScore,
    });
  },
};

// ─── Tool: craft_hook ───────────────────────────────────────────────

const craftHookTool: ContentCalendarTool = {
  name: 'craft_hook',
  description:
    'Rewrite a weak hook for a specific post. Generates 3 alternative hooks ' +
    'and picks the strongest one. Use this when a post has quality_score < 70 ' +
    'or the hook feels generic.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      day: {
        type: 'number',
        description: 'Day number of the post to rewrite the hook for',
      },
      current_hook: {
        type: 'string',
        description: 'The current hook text to improve',
      },
    },
    required: ['day', 'current_hook'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const day = Number(input.day);
    const currentHook = String(input.current_hook);

    const post = state.posts?.find(p => p.day === day);
    if (!post) {
      return JSON.stringify({ success: false, error: `No post found for day ${day}` });
    }

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are an expert at writing LinkedIn hooks that stop the scroll. You write for senior executives (45+).

${contextBlock}`,
      messages: [{
        role: 'user',
        content: `The following hook for a ${CONTENT_TYPE_LABELS[post.content_type]} post is weak:

"${currentHook}"

Post body context (first 200 chars): "${post.body.slice(0, 200)}"

Generate 3 alternative hooks using different patterns from these options:
1. Contrarian opener
2. Specific number from real experience
3. Story opener with tension
4. Direct challenge to conventional wisdom
5. Observation pattern
6. Vulnerable admission

Then pick the STRONGEST one. It must be under 210 characters (LinkedIn "see more" cutoff).

Return JSON:
{
  "alternatives": ["hook1", "hook2", "hook3"],
  "best_hook": "the strongest hook",
  "rationale": "why this hook is strongest"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        alternatives: [],
        best_hook: currentHook,
        rationale: 'Could not parse alternatives — keeping original hook.',
      };
    }

    const newHook = String(result.best_hook ?? currentHook).slice(0, 210);

    // Update post in state
    post.hook = newHook;
    // Replace hook in body if it starts with the old hook
    if (post.body.startsWith(currentHook)) {
      post.body = newHook + post.body.slice(currentHook.length);
    }

    // Recalculate quality — bump score for improved hook
    if (newHook.length >= 30 && !/^(I'm excited|Happy Monday|Here's a thought)/i.test(newHook)) {
      post.quality_score = Math.min(100, post.quality_score + 15);
    }

    ctx.emit({ type: 'transparency', stage: 'writing', message: `Writer: Rewrote hook for Day ${day} — "${newHook.slice(0, 60)}..."` });

    return JSON.stringify({
      success: true,
      day,
      original_hook: currentHook,
      new_hook: newHook,
      rationale: String(result.rationale ?? ''),
    });
  },
};

// ─── Tool: add_hashtags ─────────────────────────────────────────────

const addHashtagsTool: ContentCalendarTool = {
  name: 'add_hashtags',
  description:
    'Generate or refine hashtags for a specific post. Picks 3-5 hashtags ' +
    '(1 broad, 1-2 medium, 1-2 niche) following Rule 4.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      day: {
        type: 'number',
        description: 'Day number of the post to add hashtags for',
      },
    },
    required: ['day'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const day = Number(input.day);

    const post = state.posts?.find(p => p.day === day);
    if (!post) {
      return JSON.stringify({ success: false, error: `No post found for day ${day}` });
    }

    const theme = state.themes?.find(t => t.id === post.theme_id);

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 1024,
      system: 'You are a LinkedIn hashtag strategist. Return ONLY valid JSON.',
      messages: [{
        role: 'user',
        content: `Generate hashtags for this LinkedIn post.

Content type: ${CONTENT_TYPE_LABELS[post.content_type]}
Theme: ${theme?.name ?? post.theme_id}
Theme keywords: ${theme?.keywords.join(', ') ?? 'N/A'}
Post hook: "${post.hook}"
Target audience: ${state.audience_mapping?.primary_audience ?? 'Senior executives'}
Industry: ${state.target_context?.target_industry ?? 'General business'}

Requirements (Rule 4):
- Exactly 3-5 hashtags
- 1 broad hashtag (>1M followers): e.g., #Leadership, #Innovation
- 1-2 medium hashtags (10K-1M): industry or role-specific
- 1-2 niche hashtags (<10K): highly specific to this topic
- Never use #hiring, #opentowork, or job-seeking hashtags
- Each hashtag starts with #

Return JSON:
{
  "hashtags": ["#Tag1", "#Tag2", "#Tag3", "#Tag4"],
  "rationale": "why these hashtags were chosen"
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      // Fallback: use theme keywords as hashtags
      const fallbackTags = (theme?.keywords ?? ['Leadership', 'Executive']).slice(0, 4).map(k => `#${k.replace(/\s+/g, '')}`);
      result = {
        hashtags: fallbackTags,
        rationale: 'Fallback — generated from theme keywords.',
      };
    }

    const hashtags: string[] = Array.isArray(result.hashtags)
      ? result.hashtags.map(String).filter((t: string) => t.startsWith('#')).slice(0, 5)
      : post.hashtags;

    post.hashtags = hashtags;

    return JSON.stringify({
      success: true,
      day,
      hashtags,
      rationale: String(result.rationale ?? ''),
    });
  },
};

// ─── Tool: schedule_post ────────────────────────────────────────────

const schedulePostTool: ContentCalendarTool = {
  name: 'schedule_post',
  description:
    'Assign optimal posting day_of_week and posting_time for a specific post. ' +
    'Pure logic — no LLM call. Skips weekends and Monday per Rule 5.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      day: {
        type: 'number',
        description: 'Day number (1-30) to schedule',
      },
    },
    required: ['day'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const day = Number(input.day);

    const post = state.posts?.find(p => p.day === day);
    if (!post) {
      return JSON.stringify({ success: false, error: `No post found for day ${day}` });
    }

    // Map day number to posting day — skip weekends and Monday (Rule 5)
    // Posting days cycle: Tuesday, Wednesday, Thursday, Friday
    const postingDays: DayOfWeek[] = ['tuesday', 'wednesday', 'thursday', 'friday'];
    const dayIndex = (day - 1) % postingDays.length;
    const dayOfWeek = postingDays[dayIndex];

    // Assign posting time based on day_of_week (Rule 5)
    // Tue-Thu: 7:30-8:30 AM EST, Fri: 10:00-11:00 AM EST
    const timeMap: Record<DayOfWeek, string> = {
      monday: '8:00 AM EST',    // not used, but defined for completeness
      tuesday: '7:30 AM EST',
      wednesday: '8:00 AM EST',
      thursday: '8:30 AM EST',
      friday: '10:00 AM EST',
    };
    const postingTime = timeMap[dayOfWeek];

    post.day_of_week = dayOfWeek;
    post.posting_time = postingTime;

    return JSON.stringify({
      success: true,
      day,
      day_of_week: dayOfWeek,
      posting_time: postingTime,
    });
  },
};

// ─── Tool: assemble_calendar ────────────────────────────────────────

const assembleCalendarTool: ContentCalendarTool = {
  name: 'assemble_calendar',
  description:
    'Assemble all written posts into the final 30-day content calendar report. ' +
    'Calculates overall quality_score and coherence_score. ' +
    'Call this after ALL posts have been written and scheduled. ' +
    'Does NOT emit calendar_complete — finalizeResult handles that.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const posts = state.posts ?? [];

    if (posts.length === 0) {
      return JSON.stringify({ success: false, error: 'No posts have been written yet.' });
    }

    // Sort posts by day number
    const sortedPosts = [...posts].sort((a, b) => a.day - b.day);

    // ─── Quality scoring ────────────────────────────────────────────

    // Average post quality
    const avgQuality = Math.round(
      sortedPosts.reduce((sum, p) => sum + p.quality_score, 0) / sortedPosts.length
    );

    // Coherence scoring
    let coherenceScore = 100;

    // Check content type variety — penalize if same type appears back-to-back
    for (let i = 1; i < sortedPosts.length; i++) {
      if (sortedPosts[i].content_type === sortedPosts[i - 1].content_type) {
        coherenceScore -= 5;
      }
    }

    // Check theme coverage — each theme should appear at least 3 times
    if (state.themes && state.themes.length > 0) {
      const themeCounts: Record<string, number> = {};
      for (const p of sortedPosts) {
        themeCounts[p.theme_id] = (themeCounts[p.theme_id] ?? 0) + 1;
      }
      for (const theme of state.themes) {
        if ((themeCounts[theme.id] ?? 0) < 3) {
          coherenceScore -= 10;
        }
      }
    }

    // Check week-level type distribution — no more than 2 of same type per week
    const weeks: PlannedPost[][] = [];
    for (let i = 0; i < sortedPosts.length; i += 4) {
      weeks.push(sortedPosts.slice(i, i + 4));
    }
    for (const week of weeks) {
      const typeCounts: Record<string, number> = {};
      for (const p of week) {
        typeCounts[p.content_type] = (typeCounts[p.content_type] ?? 0) + 1;
        if (typeCounts[p.content_type] > 2) {
          coherenceScore -= 5;
        }
      }
    }

    coherenceScore = Math.max(0, coherenceScore);

    // ─── Assemble markdown report ───────────────────────────────────

    const candidateName = state.resume_data?.name ?? 'Executive';
    const targetRole = state.target_context?.target_role ?? state.resume_data?.current_title ?? 'Target Role';

    const parts: string[] = [];
    parts.push('# 30-Day LinkedIn Content Calendar');
    parts.push('');
    parts.push(`**Executive:** ${candidateName}`);
    parts.push(`**Target Role:** ${targetRole}`);
    if (state.target_context?.target_industry) {
      parts.push(`**Industry:** ${state.target_context.target_industry}`);
    }
    parts.push(`**Total Posts:** ${sortedPosts.length}`);
    parts.push(`**Quality Score:** ${avgQuality}%`);
    parts.push(`**Coherence Score:** ${coherenceScore}%`);
    parts.push('');
    parts.push('---');
    parts.push('');

    // Themes summary
    if (state.themes && state.themes.length > 0) {
      parts.push('## Content Themes');
      parts.push('');
      for (const theme of state.themes) {
        const count = sortedPosts.filter(p => p.theme_id === theme.id).length;
        parts.push(`- **${theme.name}** — ${count} posts`);
      }
      parts.push('');
      parts.push('---');
      parts.push('');
    }

    // Content mix summary
    const typeCountSummary: Partial<Record<ContentType, number>> = {};
    for (const p of sortedPosts) {
      typeCountSummary[p.content_type] = (typeCountSummary[p.content_type] ?? 0) + 1;
    }
    parts.push('## Content Mix');
    parts.push('');
    for (const [type, count] of Object.entries(typeCountSummary)) {
      const label = CONTENT_TYPE_LABELS[type as ContentType] ?? type;
      const pct = Math.round((count / sortedPosts.length) * 100);
      parts.push(`- ${label}: ${count} posts (${pct}%)`);
    }
    parts.push('');
    parts.push('---');
    parts.push('');

    // Weekly calendar
    for (let weekNum = 0; weekNum < weeks.length; weekNum++) {
      const week = weeks[weekNum];
      parts.push(`## Week ${weekNum + 1}`);
      parts.push('');

      for (const post of week) {
        const typeLabel = CONTENT_TYPE_LABELS[post.content_type] ?? post.content_type;
        const dayLabel = post.day_of_week.charAt(0).toUpperCase() + post.day_of_week.slice(1);

        parts.push(`### Day ${post.day} — ${dayLabel} (${typeLabel})`);
        parts.push(`**Post at:** ${post.posting_time} | **Quality:** ${post.quality_score}% | **Words:** ${post.word_count}`);
        parts.push('');
        parts.push(post.body);
        parts.push('');
        if (post.cta) {
          parts.push(`**CTA:** ${post.cta}`);
          parts.push('');
        }
        if (post.hashtags.length > 0) {
          parts.push(post.hashtags.join(' '));
          parts.push('');
        }
        parts.push('---');
        parts.push('');
      }
    }

    // Quality notes
    const qualityNotes: string[] = [];
    if (avgQuality < 70) {
      qualityNotes.push('Overall quality is below target (70%) — consider rewriting weak hooks.');
    }
    if (coherenceScore < 70) {
      qualityNotes.push('Coherence score is below target (70%) — check theme coverage and type variety.');
    }
    const weakPosts = sortedPosts.filter(p => p.quality_score < 60);
    if (weakPosts.length > 0) {
      qualityNotes.push(`${weakPosts.length} post(s) scored below 60% — Days: ${weakPosts.map(p => p.day).join(', ')}`);
    }

    if (qualityNotes.length > 0) {
      parts.push('## Quality Notes');
      parts.push('');
      for (const note of qualityNotes) {
        parts.push(`- ${note}`);
      }
      parts.push('');
    }

    // Engagement tips
    parts.push('## Engagement Tips');
    parts.push('');
    parts.push('- Respond to ALL comments within 24 hours');
    parts.push('- Engage with 3-5 other posts before and after publishing yours');
    parts.push('- Save a copy of high-performing posts to repurpose in 60-90 days');
    parts.push('- Track which content types get the most engagement and adjust future calendars accordingly');
    parts.push('');

    const finalReport = parts.join('\n');

    // Store on state — do NOT emit calendar_complete (finalizeResult handles that)
    state.final_report = finalReport;
    state.quality_score = avgQuality;
    state.coherence_score = coherenceScore;

    return JSON.stringify({
      success: true,
      post_count: sortedPosts.length,
      quality_score: avgQuality,
      coherence_score: coherenceScore,
      quality_notes: qualityNotes,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const writerTools: ContentCalendarTool[] = [
  writePostTool,
  craftHookTool,
  addHashtagsTool,
  schedulePostTool,
  assembleCalendarTool,
];
