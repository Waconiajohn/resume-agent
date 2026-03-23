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
  renderEvidenceInventorySection,
  renderPositioningStrategySection,
} from '../../../contracts/shared-context-prompt.js';

// ─── Section writing prompts ───────────────────────────────────────────

function buildSectionPrompt(section: ProfileSection, state: LinkedInEditorState): string {
  const platformContext = state.platform_context;
  const approvedSections = state.section_drafts;
  const analysis = state.analysis;

  const parts: string[] = [`Write the LinkedIn ${section} for this professional.`, ''];

  // Approved sections for tone adaptation
  const approvedEntries = Object.entries(approvedSections ?? {}) as [ProfileSection, string][];
  if (approvedEntries.length > 0) {
    parts.push('## Previously Approved Sections (adapt tone to match)');
    for (const [sec, content] of approvedEntries) {
      parts.push(`### ${sec}`, content.slice(0, 500), '');
    }
  }

  if (platformContext?.positioning_strategy) {
    parts.push(...renderPositioningStrategySection({
      heading: '## Positioning Strategy',
      legacyStrategy: platformContext.positioning_strategy,
    }));
  }

  if (platformContext?.evidence_items && platformContext.evidence_items.length > 0) {
    parts.push(...renderEvidenceInventorySection({
      heading: '## Evidence Items (use specific metrics and stories)',
      legacyEvidence: platformContext.evidence_items,
      maxItems: 6,
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
      '- Must include: current role/title | key differentiator | industry keywords',
      '- Avoid: "Seeking opportunities", generic titles, buzzwords like "passionate"',
      '- Format: [Role] | [Value Proposition] | [Industry/Function Keywords]',
    );
  } else if (section === 'about') {
    parts.push(
      '## About Section Requirements',
      '- 3-5 paragraphs, ~300-500 words',
      '- Open with a hook — not "I am a..."',
      '- Include: what you do, who you do it for, what makes you different, social proof',
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
      '- Degree, institution, year',
      '- Add any executive education, certifications, or notable coursework',
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
    const sectionContent = String(parsed[contentKey] ?? raw.slice(0, 2000));

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
      message: `Reviewing ${section} for keyword coverage and positioning alignment...`,
    });

    const positioningStrategy = state.platform_context?.positioning_strategy;
    const positioningSection = positioningStrategy
      ? renderPositioningStrategySection({
          heading: '## Target Positioning',
          legacyStrategy: positioningStrategy,
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

Return scores (0-100) as:
{
  "keyword_coverage": 75,
  "readability": 80,
  "positioning_alignment": 70,
  "keyword_notes": "specific feedback",
  "readability_notes": "specific feedback",
  "alignment_notes": "specific feedback"
}`,
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
      keyword_coverage: typeof scores.keyword_coverage === 'number' ? scores.keyword_coverage : 70,
      readability: typeof scores.readability === 'number' ? scores.readability : 75,
      positioning_alignment: typeof scores.positioning_alignment === 'number' ? scores.positioning_alignment : 70,
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

${state.platform_context?.evidence_items
  ? renderEvidenceInventorySection({
      heading: '## Available Evidence (use if user requests specific examples)',
      legacyEvidence: state.platform_context.evidence_items,
      maxItems: 6,
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

    const revisedContent = String(parsed[`${section}_content`] ?? currentDraft);
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
