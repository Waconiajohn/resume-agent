/**
 * LinkedIn Profile Editor — Tool definitions.
 *
 * 5 tools:
 * - write_section: Writes one LinkedIn profile section
 * - self_review_section: Checks keyword coverage, readability, positioning alignment
 * - revise_section: Revises based on user feedback
 * - present_section: Emits section_draft_ready SSE event
 * - emit_transparency: Shared transparency tool
 */

import type { LinkedInEditorTool, ProfileSection, SectionQualityScores } from '../types.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { createEmitTransparency } from '../../runtime/shared-tools.js';
import type { LinkedInEditorState, LinkedInEditorSSEEvent } from '../types.js';
import {
  renderBenchmarkProfileDirectionSection,
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';
import {
  AGE_AWARENESS_RULES,
  EVIDENCE_LADDER_RULES,
  HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
} from '../../shared-knowledge.js';

// ─── Section writing prompts ───────────────────────────────────────────

const FIRST_IMPRESSION_PROFILE_STANDARD = `## Five-Second / Benchmark Candidate Standard

This profile must pass the human scan before it passes the keyword scan:
- Headline: in a recruiter search result, the reader must know what this person does, why they are credible, and what keywords they own in under five seconds.
- Top of About: the first 300 characters must work before "see more" is clicked. It should answer "why this person?" immediately, not warm up with biography.
- Benchmark candidate test: every section should make the user feel like the obvious strong comparison point for the target roles, while staying fully evidence-grounded.
- Search + persuasion: include the right LinkedIn keywords, but never at the expense of a memorable human positioning statement.
- No filler: avoid "results-driven," "passionate," "dynamic," "seasoned," "proven track record," and generic transformation language unless it is tied to specific proof.`;

function scoreFrom(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value)))
    : fallback;
}

function normalizeHeadlineText(text: string): string {
  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .trim();

  if (normalized.length <= 220) {
    return normalized.replace(/(?:\s+\||[|,;:.-])\s*$/g, '').trim();
  }

  const target = normalized.slice(0, 220);
  const cutPoints = [
    target.lastIndexOf(' | '),
    target.lastIndexOf(' - '),
    target.lastIndexOf(', '),
    target.lastIndexOf(' '),
  ].filter((idx) => idx >= 160);

  const cutAt = cutPoints.length > 0 ? Math.max(...cutPoints) : 220;
  return normalized
    .slice(0, cutAt)
    .replace(/(?:\s+\||[|,;:.-])\s*$/g, '')
    .trim();
}

function buildSectionPrompt(section: ProfileSection, state: LinkedInEditorState): string {
  const platformContext = state.platform_context;
  const sharedContext = state.shared_context;
  const approvedSections = state.section_drafts;
  const analysis = state.analysis;

  const parts: string[] = [`Write the LinkedIn ${section} for this professional.`, ''];

  parts.push(
    '## Evidence and Editorial Standard',
    'Every factual claim must trace to the current LinkedIn profile, shared career context, positioning strategy, or evidence inventory. Use adjacent proof creatively when it is honest; never invent credentials, employers, certifications, metrics, tools, or outcomes.',
    '',
    EVIDENCE_LADDER_RULES,
    '',
    HUMAN_EDITORIAL_EFFECTIVENESS_RULES,
    '',
    FIRST_IMPRESSION_PROFILE_STANDARD,
    '',
    '## Age Awareness',
    AGE_AWARENESS_RULES,
    'For LinkedIn, avoid unnecessary age signals. Do not include graduation years or early-career chronology unless the user explicitly asks for it or the date is recent and strategically useful.',
    '',
  );

  // Approved sections for tone adaptation
  const approvedEntries = Object.entries(approvedSections ?? {}) as [ProfileSection, string][];
  if (approvedEntries.length > 0) {
    parts.push('## Previously Approved Sections (adapt tone to match)');
    for (const [sec, content] of approvedEntries) {
      parts.push(`### ${sec}`, content.slice(0, 500), '');
    }
  }

  if (hasMeaningfulSharedValue(sharedContext?.careerNarrative)) {
    parts.push(...renderCareerNarrativeSection({
      heading: '## Career Narrative Signals',
      sharedNarrative: sharedContext?.careerNarrative,
    }));
  }

  parts.push(...renderBenchmarkProfileDirectionSection({
    heading: '## Benchmark Profile Direction',
    sharedContext,
  }));

  if (platformContext?.positioning_strategy || hasMeaningfulSharedValue(sharedContext?.positioningStrategy)) {
    parts.push(...renderPositioningStrategySection({
      heading: '## Positioning Strategy',
      sharedStrategy: sharedContext?.positioningStrategy,
      legacyStrategy: platformContext?.positioning_strategy,
    }));
  }

  if (hasMeaningfulSharedValue(sharedContext?.evidenceInventory.evidenceItems)
    || (platformContext?.evidence_items?.length ?? 0) > 0) {
    parts.push(...renderEvidenceInventorySection({
      heading: '## Evidence Items (use specific metrics and stories)',
      sharedInventory: sharedContext?.evidenceInventory,
      legacyEvidence: platformContext?.evidence_items,
      maxItems: 15,
    }));
  }

  if (state.current_profile) {
    parts.push(
      '## Current LinkedIn Profile (reference, then improve)',
      state.current_profile.slice(0, 2000),
      '',
    );
  }

  if (analysis) {
    parts.push(
      '## Profile Analysis',
      `Keyword opportunities: ${analysis.keyword_opportunities.join(', ')}`,
      '',
    );
  }

  // Section-specific instructions
  if (section === 'headline') {
    parts.push(
      '## Headline Requirements',
      '- Max 220 characters (LinkedIn limit)',
      '- Must pass the five-second recruiter search result test: role identity, business value, credibility signal, and 2-4 high-value keywords are obvious immediately',
      '- Write a positioning statement, not just a job title. The first phrase should make the target reader want to click.',
      '- Must include: current/target role identity | key differentiator or proof | industry/function keywords',
      '- Avoid: "Seeking opportunities", generic titles, buzzwords like "passionate"',
      '- Do not cut off mid-phrase or end with a dangling separator',
      '- Format: [Role] | [Value Proposition] | [Industry/Function Keywords]',
    );
  } else if (section === 'about') {
    parts.push(
      '## About Section Requirements',
      '- Target 1,500-2,300 characters, usually 250-375 words. Do not pad.',
      '- The first 300 characters must stand alone before LinkedIn "see more" and answer: why this person, why now, why credible',
      '- Open with the benchmark-candidate thesis — not "I am a..." and not a chronology',
      '- Include: what you do, who you do it for, what makes you different, social proof',
      '- Use the Why Me/career narrative as the spine: communicate who they are, not just what jobs they held',
      '- Put proof near the top. Do not bury the strongest metric or signature strength.',
      '- End with a clear CTA (connect, message, visit website)',
      '- Use first person throughout',
    );
  } else if (section === 'experience') {
    parts.push(
      '## Experience Section Requirements',
      '- 2-3 most recent roles, 3-5 bullets each',
      '- Format: Achievement-Impact-Metric (not responsibility lists)',
      '- Include specific metrics where evidence provides them',
      '- Keywords front-loaded in each bullet',
      '- Prioritize proof that reinforces the benchmark-candidate profile and target positioning',
    );
  } else if (section === 'skills') {
    parts.push(
      '## Skills Section Requirements',
      '- 10-15 skills, ordered by strategic importance',
      '- Mix of: technical skills, soft skills, industry keywords, functional expertise',
      '- List as comma-separated values',
    );
  } else if (section === 'education') {
    parts.push(
      '## Education Section Requirements',
      '- Degree and institution; omit graduation years by default for executives 45+',
      '- Add executive education, certifications, or notable coursework only when supported by source evidence',
      '- Include a year only if it is recent/current, user-provided, and strategically useful',
      '- Keep concise — education matters less for executives than impact',
    );
  }

  parts.push(
    '',
    'Return ONLY valid JSON:',
    '{',
    `  "${section}_content": "The full section text",`,
    '  "keywords_used": ["keyword1", "keyword2"]',
    '}',
  );

  return parts.join('\n');
}

// ─── Tool: write_section ───────────────────────────────────────────────

const writeSectionTool: LinkedInEditorTool = {
  name: 'write_section',
  description:
    'Writes one LinkedIn profile section. Adapts tone based on previously approved sections. ' +
    'Draws on positioning strategy and evidence items for authentic content. ' +
    'Stores the draft in scratchpad.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['headline', 'about', 'experience', 'skills', 'education'],
        description: 'Which LinkedIn profile section to write',
      },
    },
    required: ['section'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const section = String(input.section ?? '') as ProfileSection;

    const validSections: ProfileSection[] = ['headline', 'about', 'experience', 'skills', 'education'];
    if (!validSections.includes(section)) {
      return { success: false, reason: `Invalid section: ${section}` };
    }

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Writing your LinkedIn ${section}...`,
    });

    const prompt = buildSectionPrompt(section, state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system:
        'You are a LinkedIn profile writer for executives. You write in the executive\'s authentic ' +
        'voice, using specific evidence and metrics. You never use buzzwords or generic corporate speak. ' +
        'You avoid age-bias signals such as unnecessary graduation years. ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const raw = response.text ?? '{}';
    let parsed: Record<string, unknown>;

    try {
      parsed = repairJSON<Record<string, unknown>>(raw) ?? { [`${section}_content`]: raw.slice(0, 2000) };
    } catch {
      parsed = { [`${section}_content`]: raw.slice(0, 2000) };
    }

    const contentKey = `${section}_content`;
    let sectionContent = String(parsed[contentKey] ?? raw.slice(0, 2000));
    if (section === 'headline') {
      sectionContent = normalizeHeadlineText(sectionContent);
    }

    // Store in scratchpad with section key
    ctx.scratchpad[`draft_${section}`] = sectionContent;
    ctx.scratchpad.current_section = section;

    return { section, content: sectionContent };
  },
};

// ─── Tool: self_review_section ─────────────────────────────────────────

const selfReviewSectionTool: LinkedInEditorTool = {
  name: 'self_review_section',
  description:
    'Checks the drafted section against optimization targets: keyword density, ' +
    'readability, and positioning alignment. Returns quality scores. ' +
    'Stores scores in scratchpad.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['headline', 'about', 'experience', 'skills', 'education'],
        description: 'Which section to review',
      },
    },
    required: ['section'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const section = String(input.section ?? ctx.scratchpad.current_section ?? '') as ProfileSection;
    const sectionContent = String(ctx.scratchpad[`draft_${section}`] ?? '');

    if (!sectionContent) {
      return { success: false, reason: `No draft for ${section} — call write_section first` };
    }

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Reviewing ${section} for five-second strength, proof, and positioning...`,
    });

    const positioningSection = (
      state.platform_context?.positioning_strategy ||
      hasMeaningfulSharedValue(state.shared_context?.positioningStrategy)
    )
      ? renderPositioningStrategySection({
          heading: '## Target Positioning',
          sharedStrategy: state.shared_context?.positioningStrategy,
          legacyStrategy: state.platform_context?.positioning_strategy,
        }).join('\n')
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 1024,
      system:
        'You review LinkedIn profile sections for quality. Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: `Review this LinkedIn ${section} and return quality scores:

## Section Content
${sectionContent}

${positioningSection}

${FIRST_IMPRESSION_PROFILE_STANDARD}

Return scores (0-100) as:
{
  "keyword_coverage": 75,
  "readability": 80,
  "positioning_alignment": 70,
  "five_second_test": 75,
  "hook_strength": 75,
  "benchmark_strength": 75,
  "proof_specificity": 75,
  "searchability": 75,
  "keyword_notes": "specific feedback",
  "readability_notes": "specific feedback",
  "alignment_notes": "specific feedback",
  "five_second_notes": "does the headline or visible About section pass the recruiter/hiring-manager scan?",
  "benchmark_notes": "does this make them feel like a benchmark candidate?",
  "proof_notes": "are the claims specific and source-grounded?"
}

Scoring focus:
- Headline: weigh five_second_test and searchability heavily. A generic title should score below 70 even if it has keywords.
- About: weigh hook_strength and five_second_test heavily. The first 300 characters must carry the Why Me story before "see more".
- Experience: weigh proof_specificity heavily. Responsibilities without outcomes should score below 70.
- Skills/Education: judge strategic ordering, age-awareness, and whether the section supports target positioning.
Return ONLY valid JSON.`,
        },
      ],
    });

    const raw = response.text ?? '{}';
    let scores: Record<string, unknown>;

    try {
      scores = repairJSON<Record<string, unknown>>(raw) ?? { keyword_coverage: 70, readability: 75, positioning_alignment: 70 };
    } catch {
      scores = { keyword_coverage: 70, readability: 75, positioning_alignment: 70 };
    }

    const qualityScores: SectionQualityScores = {
      keyword_coverage: scoreFrom(scores.keyword_coverage, 70),
      readability: scoreFrom(scores.readability, 75),
      positioning_alignment: scoreFrom(scores.positioning_alignment, 70),
      five_second_test: scoreFrom(scores.five_second_test, 70),
      hook_strength: scoreFrom(scores.hook_strength, 70),
      benchmark_strength: scoreFrom(scores.benchmark_strength, 70),
      proof_specificity: scoreFrom(scores.proof_specificity, 70),
      searchability: scoreFrom(scores.searchability, 70),
    };

    ctx.scratchpad[`scores_${section}`] = qualityScores;

    return { section, quality_scores: qualityScores };
  },
};

// ─── Tool: revise_section ──────────────────────────────────────────────

const reviseSectionTool: LinkedInEditorTool = {
  name: 'revise_section',
  description:
    'Revises a section based on user feedback. Updates the draft in scratchpad.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['headline', 'about', 'experience', 'skills', 'education'],
        description: 'Which section to revise',
      },
      feedback: {
        type: 'string',
        description: 'User feedback describing what to change',
      },
    },
    required: ['section', 'feedback'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const section = String(input.section ?? '') as ProfileSection;
    const feedback = String(input.feedback ?? '');
    const currentDraft = String(ctx.scratchpad[`draft_${section}`] ?? '');

    if (!currentDraft) {
      return { success: false, reason: `No draft for ${section} to revise` };
    }

    if (!feedback) {
      return { success: false, reason: 'No feedback provided' };
    }

    ctx.emit({
      type: 'transparency',
      stage: state.current_stage,
      message: `Revising ${section} based on your feedback...`,
    });

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 3072,
      system:
        'You revise LinkedIn profile sections based on user feedback. Keep the authentic voice. ' +
        'Return ONLY valid JSON, no markdown fencing.',
      messages: [
        {
          role: 'user',
          content: `Revise this LinkedIn ${section} based on the feedback:

## Current ${section}
${currentDraft}

## User Feedback
${feedback}

${FIRST_IMPRESSION_PROFILE_STANDARD}

${(
  hasMeaningfulSharedValue(state.shared_context?.evidenceInventory.evidenceItems) ||
  state.platform_context?.evidence_items
)
  ? renderEvidenceInventorySection({
      heading: '## Available Evidence (use if user requests specific examples)',
      sharedInventory: state.shared_context?.evidenceInventory,
      legacyEvidence: state.platform_context?.evidence_items,
      maxItems: 15,
    }).join('\n')
  : ''}

Return ONLY valid JSON:
{
  "${section}_content": "The revised section text",
  "revision_notes": "What was changed and why"
}`,
        },
      ],
    });

    const raw = response.text ?? '{}';
    let parsed: Record<string, unknown>;

    try {
      parsed = repairJSON<Record<string, unknown>>(raw) ?? { [`${section}_content`]: currentDraft };
    } catch {
      parsed = { [`${section}_content`]: currentDraft };
    }

    let revisedContent = String(parsed[`${section}_content`] ?? currentDraft);
    if (section === 'headline') {
      revisedContent = normalizeHeadlineText(revisedContent);
    }
    ctx.scratchpad[`draft_${section}`] = revisedContent;

    // Store feedback in state
    const currentFeedback = state.section_feedback ?? {};
    ctx.updateState({
      section_feedback: { ...currentFeedback, [section]: feedback },
    });

    return { section, content: revisedContent, revision_notes: parsed.revision_notes };
  },
};

// ─── Tool: present_section ─────────────────────────────────────────────

const presentSectionTool: LinkedInEditorTool = {
  name: 'present_section',
  description:
    'Emits the section_draft_ready SSE event for user review. ' +
    'No LLM call — just formats and emits. Call after self_review_section.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        enum: ['headline', 'about', 'experience', 'skills', 'education'],
        description: 'Which section to present',
      },
    },
    required: ['section'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const section = String(input.section ?? ctx.scratchpad.current_section ?? '') as ProfileSection;
    const content = String(ctx.scratchpad[`draft_${section}`] ?? '');
    const qualityScores = (ctx.scratchpad[`scores_${section}`] as SectionQualityScores) ?? {
      keyword_coverage: 70,
      readability: 75,
      positioning_alignment: 70,
    };

    if (!content) {
      return { success: false, reason: `No draft for ${section} to present` };
    }

    ctx.emit({
      type: 'section_draft_ready',
      session_id: state.session_id,
      section,
      content,
      quality_scores: qualityScores,
    });

    return { presented: true, section };
  },
};

// ─── Tool exports ──────────────────────────────────────────────────────

export const editorTools: LinkedInEditorTool[] = [
  writeSectionTool,
  selfReviewSectionTool,
  reviseSectionTool,
  presentSectionTool,
  createEmitTransparency<LinkedInEditorState, LinkedInEditorSSEEvent>({ prefix: 'Editor: ' }),
];
