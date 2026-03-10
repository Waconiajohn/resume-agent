/**
 * Executive Bio Writer — Tool definitions.
 *
 * 4 tools:
 * - analyze_positioning: Parse resume and analyze candidate positioning
 * - write_bio: Write a single bio for a given format + length
 * - quality_check_bio: Quality check a written bio against criteria
 * - assemble_bio_collection: Assemble all bios into a formatted collection
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  ExecutiveBioState,
  ExecutiveBioSSEEvent,
  Bio,
  BioFormat,
  BioLength,
  PositioningAnalysis,
} from '../types.js';
import { BIO_LENGTH_TARGETS, BIO_FORMAT_LABELS, BIO_LENGTH_LABELS } from '../types.js';
import { EXECUTIVE_BIO_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type WriterTool = AgentTool<ExecutiveBioState, ExecutiveBioSSEEvent>;

// ─── Tool: analyze_positioning ────────────────────────────────────

const analyzePositioningTool: WriterTool = {
  name: 'analyze_positioning',
  description:
    'Analyze the candidate\'s resume and positioning strategy to identify core identity, ' +
    'key achievements, differentiators, and tone recommendations for bio writing.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      resume_text: {
        type: 'string',
        description: 'The full text of the candidate\'s resume',
      },
    },
    required: ['resume_text'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const resumeText = String(input.resume_text ?? '');

    const platformContext = state.platform_context
      ? `\n## Platform Context\nPositioning Strategy: ${JSON.stringify(state.platform_context.positioning_strategy, null, 2)}\nWhy-Me Narrative: ${state.platform_context.why_me_story ?? 'N/A'}`
      : '';

    const targetContext = state.target_context
      ? `\n## Target Context\nRole: ${state.target_context.target_role}\nIndustry: ${state.target_context.target_industry}\nSeniority: ${state.target_context.target_seniority}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: `You are a senior executive positioning strategist. You analyze resumes and professional backgrounds to identify the core narrative, key achievements, and differentiators that should anchor executive bios.

${EXECUTIVE_BIO_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Analyze this resume and identify the positioning strategy for writing executive bios.

## Resume
${resumeText}
${platformContext}
${targetContext}

REQUIREMENTS:
- Identify the executive's core professional identity — the single sentence that captures who they are
- Extract 5-8 key achievements that are most bio-worthy (quantified, impactful, relevant)
- Identify 3-5 differentiators — what sets this executive apart from peers at the same level
- Determine the target audience for the bios based on the resume and context
- Recommend tone and voice direction (authoritative, approachable, visionary, etc.)
- Ground everything in real resume content — never fabricate or embellish

Return JSON:
{
  "core_identity": "single sentence capturing who this executive is",
  "key_achievements": ["achievement 1", "achievement 2", "..."],
  "differentiators": ["differentiator 1", "differentiator 2", "..."],
  "target_audience": "who these bios are written for",
  "tone_recommendation": "recommended tone and voice direction",
  "resume_data": {
    "name": "candidate name",
    "current_title": "current title",
    "career_summary": "brief career summary",
    "key_skills": ["skill1", "skill2"],
    "key_achievements": ["achievement1", "achievement2"],
    "work_history": [
      {
        "company": "company name",
        "title": "title",
        "duration": "duration",
        "highlights": ["highlight1"]
      }
    ]
  }
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        core_identity: 'Unable to parse — review raw output',
        key_achievements: [],
        differentiators: [],
        target_audience: 'Unknown',
        tone_recommendation: 'professional',
        resume_data: null,
      };
    }

    const positioning: PositioningAnalysis = {
      core_identity: String(result.core_identity ?? ''),
      key_achievements: Array.isArray(result.key_achievements)
        ? result.key_achievements.map(String)
        : [],
      differentiators: Array.isArray(result.differentiators)
        ? result.differentiators.map(String)
        : [],
      target_audience: String(result.target_audience ?? ''),
      tone_recommendation: String(result.tone_recommendation ?? ''),
      // The career_summary in resume_data is always LLM-synthesized (not extracted verbatim)
      career_summary_is_synthesized: true,
    };

    // Store resume_data if parsed
    if (result.resume_data && typeof result.resume_data === 'object') {
      const rd = result.resume_data;
      const resumeData = {
        name: String(rd.name ?? ''),
        current_title: String(rd.current_title ?? ''),
        career_summary: String(rd.career_summary ?? ''),
        key_skills: Array.isArray(rd.key_skills) ? rd.key_skills.map(String) : [],
        key_achievements: Array.isArray(rd.key_achievements) ? rd.key_achievements.map(String) : [],
        work_history: Array.isArray(rd.work_history)
          ? rd.work_history.map((wh: Record<string, unknown>) => ({
              company: String(wh.company ?? ''),
              title: String(wh.title ?? ''),
              duration: String(wh.duration ?? ''),
              highlights: Array.isArray(wh.highlights) ? wh.highlights.map(String) : [],
            }))
          : [],
      };
      scratchpad.resume_data = resumeData;
      state.resume_data = resumeData;
    }

    scratchpad.positioning_analysis = positioning;
    state.positioning_analysis = positioning;

    return JSON.stringify({
      success: true,
      core_identity: positioning.core_identity,
      achievement_count: positioning.key_achievements.length,
      differentiator_count: positioning.differentiators.length,
      target_audience: positioning.target_audience,
    });
  },
};

// ─── Tool: write_bio ──────────────────────────────────────────────

const writeBioTool: WriterTool = {
  name: 'write_bio',
  description:
    'Write a single bio for the specified format and length. Uses positioning analysis to ' +
    'ensure alignment. Each bio is tailored to its context (speaker, board, advisory, ' +
    'professional, or LinkedIn).',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['speaker', 'board', 'advisory', 'professional', 'linkedin_featured'],
        description: 'The bio format to write',
      },
      length: {
        type: 'string',
        enum: ['micro', 'short', 'standard', 'full'],
        description: 'The bio length tier',
      },
    },
    required: ['format', 'length'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const format = String(input.format ?? 'professional') as BioFormat;
    const length = String(input.length ?? 'standard') as BioLength;
    const targetWords = BIO_LENGTH_TARGETS[length] ?? 250;
    const formatLabel = BIO_FORMAT_LABELS[format] ?? format;
    const lengthLabel = BIO_LENGTH_LABELS[length] ?? length;

    const positioning = (scratchpad.positioning_analysis ?? state.positioning_analysis) as PositioningAnalysis | undefined;
    const positioningContext = positioning
      ? `\n## Positioning Analysis\nCore Identity: ${positioning.core_identity}\nKey Achievements:\n${positioning.key_achievements.map((a) => `- ${a}`).join('\n')}\nDifferentiators:\n${positioning.differentiators.map((d) => `- ${d}`).join('\n')}\nTarget Audience: ${positioning.target_audience}\nTone: ${positioning.tone_recommendation}`
      : '';

    const resumeData = (scratchpad.resume_data ?? state.resume_data) as Record<string, unknown> | undefined;
    const resumeContext = resumeData
      ? `\n## Candidate\nName: ${resumeData.name}\nCurrent Title: ${resumeData.current_title}\nCareer Summary: ${resumeData.career_summary}`
      : '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a world-class executive bio writer. You write polished, authentic bios that position executives as leaders in their field. Every word must earn its place.

${EXECUTIVE_BIO_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a ${formatLabel} at ${lengthLabel} length (~${targetWords} words).
${positioningContext}
${resumeContext}

FORMAT-SPECIFIC GUIDANCE:
- speaker: Third person, authoritative, highlights thought leadership and speaking topics. Opens with a compelling hook.
- board: Third person, governance-focused, emphasizes strategic oversight, P&L responsibility, and industry expertise.
- advisory: Third person, positions as a trusted advisor with domain expertise and a track record of guiding organizations.
- professional: Third person, balanced overview of career arc, key achievements, and current focus.
- linkedin_featured: First person, conversational yet professional, shows personality and passion alongside credentials.

REQUIREMENTS:
- Target exactly ~${targetWords} words (±10%)
- Ground every claim in the positioning analysis — never fabricate
- Open with a strong, memorable first sentence
- Use active voice throughout
- Avoid cliches: "passionate about", "results-driven", "dynamic leader", "seasoned professional"
- Each sentence must add new information — no filler or repetition
- Close with forward-looking impact or invitation to connect

Return JSON:
{
  "content": "the full bio text",
  "tone": "first_person" or "third_person",
  "word_count": <actual word count>
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        content: response.text.trim(),
        tone: format === 'linkedin_featured' ? 'first_person' : 'third_person',
        word_count: response.text.trim().split(/\s+/).length,
      };
    }

    const content = String(result.content ?? '');
    const actualWords = content.split(/\s+/).filter(Boolean).length;

    const bio: Bio = {
      format,
      length,
      target_words: targetWords,
      content,
      actual_words: actualWords,
      quality_score: 0, // Set by quality_check_bio
      tone: result.tone === 'first_person' ? 'first_person' : 'third_person',
      positioning_alignment: 0, // Set by quality_check_bio
    };

    // Append to bios array on scratchpad
    if (!Array.isArray(scratchpad.bios)) {
      scratchpad.bios = [];
    }
    (scratchpad.bios as Bio[]).push(bio);

    // Update state
    if (!state.bios) {
      state.bios = [];
    }
    state.bios.push(bio);

    ctx.emit({
      type: 'bio_drafted',
      format,
      length,
      word_count: actualWords,
    });

    return JSON.stringify({
      success: true,
      format,
      length,
      target_words: targetWords,
      actual_words: actualWords,
      tone: bio.tone,
    });
  },
};

// ─── Tool: quality_check_bio ──────────────────────────────────────

const qualityCheckBioTool: WriterTool = {
  name: 'quality_check_bio',
  description:
    'Quality check a written bio against the self-review checklist: word count accuracy, ' +
    'tone match, positioning alignment, cliche detection, and authenticity verification.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['speaker', 'board', 'advisory', 'professional', 'linkedin_featured'],
        description: 'The bio format to quality check',
      },
      length: {
        type: 'string',
        enum: ['micro', 'short', 'standard', 'full'],
        description: 'The bio length tier to quality check',
      },
    },
    required: ['format', 'length'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;
    const format = String(input.format ?? 'professional') as BioFormat;
    const length = String(input.length ?? 'standard') as BioLength;

    // Find the most recently written bio of this format/length
    const bios = (scratchpad.bios ?? []) as Bio[];
    let bioIndex = -1;
    for (let i = bios.length - 1; i >= 0; i--) {
      if (bios[i].format === format && bios[i].length === length) { bioIndex = i; break; }
    }

    if (bioIndex === -1) {
      return JSON.stringify({
        success: false,
        error: `No bio found for format=${format}, length=${length}. Write it first.`,
      });
    }

    const bio = bios[bioIndex];
    const positioning = (scratchpad.positioning_analysis ?? state.positioning_analysis) as PositioningAnalysis | undefined;

    const positioningContext = positioning
      ? `\n## Positioning Analysis\nCore Identity: ${positioning.core_identity}\nKey Achievements:\n${positioning.key_achievements.map((a) => `- ${a}`).join('\n')}\nDifferentiators:\n${positioning.differentiators.map((d) => `- ${d}`).join('\n')}\nTone Recommendation: ${positioning.tone_recommendation}`
      : '';

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 2048,
      system: `You are a senior bio editor and quality reviewer. You evaluate executive bios against strict quality criteria.

${EXECUTIVE_BIO_RULES}

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Quality check this ${BIO_FORMAT_LABELS[format]} (${BIO_LENGTH_LABELS[length]}).

## Bio Content
${bio.content}

## Bio Metadata
- Format: ${format}
- Length: ${length}
- Target words: ${bio.target_words}
- Actual words: ${bio.actual_words}
- Tone: ${bio.tone}
${positioningContext}

REVIEW CHECKLIST:
1. Word count accuracy: Is it within ±10% of target (${bio.target_words})?
2. Tone match: Does the tone match the format? (speaker/board/advisory/professional = third person, linkedin_featured = first person)
3. Positioning alignment: Does it reflect the core identity, achievements, and differentiators?
4. Cliche detection: Any instances of "passionate about", "results-driven", "dynamic leader", "seasoned professional", etc.?
5. Authenticity: Are all claims grounded in the positioning analysis? Any fabricated credentials?
6. Opening strength: Does the first sentence hook the reader?
7. Filler detection: Any sentences that repeat information or add no value?
8. Closing impact: Does it end with forward-looking impact or invitation?

Return JSON:
{
  "quality_score": <0-100 overall quality score>,
  "positioning_alignment": <0-100 how well it aligns with positioning>,
  "word_count_ok": true/false,
  "tone_ok": true/false,
  "cliches_found": ["cliche1", "cliche2"],
  "issues": ["issue1", "issue2"],
  "strengths": ["strength1", "strength2"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        quality_score: 70,
        positioning_alignment: 70,
        word_count_ok: true,
        tone_ok: true,
        cliches_found: [],
        issues: ['Unable to parse quality check response'],
        strengths: [],
      };
    }

    const qualityScore = Math.min(100, Math.max(0, Number(result.quality_score) || 70));
    const positioningAlignment = Math.min(100, Math.max(0, Number(result.positioning_alignment) || 70));

    // Update the bio in scratchpad
    bios[bioIndex].quality_score = qualityScore;
    bios[bioIndex].positioning_alignment = positioningAlignment;

    // Update in state as well
    let stateBioIndex = -1;
    for (let i = state.bios.length - 1; i >= 0; i--) {
      if (state.bios[i].format === format && state.bios[i].length === length) { stateBioIndex = i; break; }
    }
    if (stateBioIndex !== -1) {
      state.bios[stateBioIndex].quality_score = qualityScore;
      state.bios[stateBioIndex].positioning_alignment = positioningAlignment;
    }

    ctx.emit({
      type: 'bio_complete',
      format,
      length,
      quality_score: qualityScore,
    });

    return JSON.stringify({
      success: true,
      format,
      length,
      quality_score: qualityScore,
      positioning_alignment: positioningAlignment,
      word_count_ok: Boolean(result.word_count_ok),
      tone_ok: Boolean(result.tone_ok),
      cliches_found: Array.isArray(result.cliches_found) ? result.cliches_found.map(String) : [],
      issue_count: Array.isArray(result.issues) ? result.issues.length : 0,
      strength_count: Array.isArray(result.strengths) ? result.strengths.length : 0,
    });
  },
};

// ─── Tool: assemble_bio_collection ────────────────────────────────

const assembleBioCollectionTool: WriterTool = {
  name: 'assemble_bio_collection',
  description:
    'Assemble all written bios into a formatted collection with quality scores, word counts, ' +
    'and usage guidance for each format.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const scratchpad = ctx.scratchpad;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_bio_collection',
      message: 'Assembling bio collection report...',
    });

    const bios = (scratchpad.bios ?? []) as Bio[];
    const positioning = (scratchpad.positioning_analysis ?? state.positioning_analysis) as PositioningAnalysis | undefined;

    const reportParts: string[] = [];

    // ── Header ──
    const resumeData = (scratchpad.resume_data ?? state.resume_data) as Record<string, unknown> | undefined;
    const candidateName = resumeData ? String(resumeData.name ?? 'Executive') : 'Executive';

    reportParts.push(`# Executive Bio Collection — ${candidateName}`);
    reportParts.push('');

    if (positioning) {
      reportParts.push('## Positioning Summary');
      reportParts.push('');
      reportParts.push(`**Core Identity:** ${positioning.core_identity}`);
      reportParts.push('');
      reportParts.push('**Key Differentiators:**');
      for (const diff of positioning.differentiators) {
        reportParts.push(`- ${diff}`);
      }
      reportParts.push('');
    }

    // ── Overview table ──
    reportParts.push('## Bio Overview');
    reportParts.push('');
    reportParts.push('| Format | Length | Words | Quality | Alignment |');
    reportParts.push('|--------|--------|-------|---------|-----------|');
    for (const bio of bios) {
      const formatLabel = BIO_FORMAT_LABELS[bio.format] ?? bio.format;
      const lengthLabel = BIO_LENGTH_LABELS[bio.length] ?? bio.length;
      reportParts.push(
        `| ${formatLabel} | ${lengthLabel} | ${bio.actual_words}/${bio.target_words} | ${bio.quality_score}/100 | ${bio.positioning_alignment}/100 |`,
      );
    }
    reportParts.push('');

    // ── Bios grouped by format ──
    const formatGroups = new Map<BioFormat, Bio[]>();
    for (const bio of bios) {
      const group = formatGroups.get(bio.format) ?? [];
      group.push(bio);
      formatGroups.set(bio.format, group);
    }

    for (const [format, formatBios] of formatGroups) {
      const formatLabel = BIO_FORMAT_LABELS[format] ?? format;
      reportParts.push(`## ${formatLabel}`);
      reportParts.push('');

      // Usage guidance per format
      const usageMap: Record<string, string> = {
        speaker: 'Use for conference programs, event introductions, podcast appearances, and webinar descriptions.',
        board: 'Use for board nomination packets, proxy statements, and governance committee materials.',
        advisory: 'Use for advisory board applications, consulting proposals, and expert witness profiles.',
        professional: 'Use for company websites, annual reports, press releases, and general professional profiles.',
        linkedin_featured: 'Use as the featured section on LinkedIn or personal website about pages.',
      };
      reportParts.push(`> **When to use:** ${usageMap[format] ?? 'General professional use.'}`);
      reportParts.push('');

      for (const bio of formatBios) {
        const lengthLabel = BIO_LENGTH_LABELS[bio.length] ?? bio.length;
        reportParts.push(`### ${lengthLabel}`);
        reportParts.push('');
        reportParts.push(`*${bio.actual_words} words | Quality: ${bio.quality_score}/100 | ${bio.tone === 'first_person' ? 'First person' : 'Third person'}*`);
        reportParts.push('');
        reportParts.push(bio.content);
        reportParts.push('');
        reportParts.push('---');
        reportParts.push('');
      }
    }

    const report = reportParts.join('\n');

    // ── Quality scoring ──
    const qualityScores = bios.map((b) => b.quality_score).filter((s) => s > 0);
    const overallQuality = qualityScores.length > 0
      ? Math.round(qualityScores.reduce((sum, s) => sum + s, 0) / qualityScores.length)
      : 0;

    scratchpad.final_report = report;
    scratchpad.quality_score = overallQuality;
    state.final_report = report;
    state.quality_score = overallQuality;

    ctx.emit({
      type: 'transparency',
      stage: 'assemble_bio_collection',
      message: `Bio collection assembled — ${bios.length} bios, average quality: ${overallQuality}/100`,
    });

    return JSON.stringify({
      success: true,
      report_length: report.length,
      bio_count: bios.length,
      quality_score: overallQuality,
      formats_covered: [...formatGroups.keys()],
    });
  },
};

// ─── Exports ───────────────────────────────────────────────────────

export const writerTools: WriterTool[] = [
  analyzePositioningTool,
  writeBioTool,
  qualityCheckBioTool,
  assembleBioCollectionTool,
];
