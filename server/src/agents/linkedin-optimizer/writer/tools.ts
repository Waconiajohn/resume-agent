/**
 * LinkedIn Optimizer Writer — Tool definitions.
 *
 * 5 tools:
 * - write_headline: Optimize the LinkedIn headline
 * - write_about: Optimize the LinkedIn about/summary section
 * - write_experience_entries: Optimize LinkedIn experience entries
 * - optimize_keywords: Generate optimized skills/keywords list
 * - assemble_report: Combine all sections into the final optimization report
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  LinkedInOptimizerState,
  LinkedInOptimizerSSEEvent,
  LinkedInSection,
  OptimizedSection,
  ExperienceEntry,
} from '../types.js';
import { LINKEDIN_OPTIMIZER_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';

type LinkedInOptimizerTool = AgentTool<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>;

// ─── Helpers ────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildContextBlock(state: LinkedInOptimizerState): string {
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

  if (state.profile_analysis) {
    parts.push('\n## Current Profile Analysis');
    parts.push(`Headline Assessment: ${state.profile_analysis.headline_assessment}`);
    parts.push(`About Assessment: ${state.profile_analysis.about_assessment}`);
    if (state.profile_analysis.positioning_gaps.length > 0) {
      parts.push('Positioning Gaps:');
      for (const g of state.profile_analysis.positioning_gaps) {
        parts.push(`- ${g}`);
      }
    }
    if (state.profile_analysis.strengths.length > 0) {
      parts.push('Strengths:');
      for (const s of state.profile_analysis.strengths) {
        parts.push(`- ${s}`);
      }
    }
  }

  if (state.keyword_analysis) {
    parts.push('\n## Keyword Analysis');
    parts.push(`Coverage Score: ${state.keyword_analysis.coverage_score}%`);
    if (state.keyword_analysis.missing_keywords.length > 0) {
      parts.push(`Missing Keywords: ${state.keyword_analysis.missing_keywords.join(', ')}`);
    }
    if (state.keyword_analysis.recommended_keywords.length > 0) {
      parts.push(`Recommended Keywords: ${state.keyword_analysis.recommended_keywords.join(', ')}`);
    }
  }

  if (state.current_profile) {
    parts.push('\n## Current LinkedIn Profile');
    parts.push(`Headline: ${state.current_profile.headline || '(empty)'}`);
    parts.push(`About: ${state.current_profile.about || '(empty)'}`);
    parts.push(`Experience: ${state.current_profile.experience_text || '(empty)'}`);
  }

  if (state.platform_context?.why_me_story) {
    const wm = state.platform_context.why_me_story;
    parts.push('\n## Why-Me Story (from CareerIQ)');
    if (wm.colleaguesCameForWhat) parts.push(`What colleagues came to me for: ${wm.colleaguesCameForWhat}`);
    if (wm.knownForWhat) parts.push(`What I'm known for: ${wm.knownForWhat}`);
    if (wm.whyNotMe) parts.push(`Why not me (differentiator): ${wm.whyNotMe}`);
  }

  return parts.join('\n');
}

// ─── Tool: write_headline ───────────────────────────────────────────

const writeHeadlineTool: LinkedInOptimizerTool = {
  name: 'write_headline',
  description:
    'Write an optimized LinkedIn headline following Rule 1 (Headline Optimization). ' +
    'Maximum 220 characters. Leads with value proposition, includes 2-3 high-value keywords, ' +
    'and adds a proof point with metrics if space allows. ' +
    'Call this first.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Run Analyzer first.' });
    }

    ctx.emit({ type: 'section_progress', section: 'headline', status: 'writing' });

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 2048,
      system: `You are a LinkedIn profile optimization expert for senior executives (45+).

${LINKEDIN_OPTIMIZER_RULES}

You have the following data about the candidate:

${contextBlock}`,
      messages: [{
        role: 'user',
        content: `Write an optimized LinkedIn headline following Rule 1.

Requirements:
- Maximum 220 characters — use all available space
- Lead with the VALUE PROPOSITION, not the job title
- Include 2-3 high-value keywords that recruiters search for
- Add a proof point with a metric if space allows
- Use pipe (|) or bullet (·) to separate clusters if needed
- No buzzwords without substance

Return JSON:
{
  "headline": "the optimized headline text",
  "rationale": "why this headline works — what keywords are targeted, what value proposition is communicated, and how it differs from the original",
  "keywords_included": ["keyword1", "keyword2"]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      // Extract headline from raw text
      const text = response.text.trim();
      result = {
        headline: text.slice(0, 220),
        rationale: 'Generated from resume data and keyword analysis.',
        keywords_included: [],
      };
    }

    const optimized: OptimizedSection = {
      section: 'headline',
      original: state.current_profile?.headline ?? '',
      optimized: String(result.headline ?? '').slice(0, 220),
      rationale: String(result.rationale ?? ''),
      word_count: wordCount(String(result.headline ?? '')),
    };

    if (!state.sections) {
      state.sections = {} as LinkedInOptimizerState['sections'];
    }
    state.sections.headline = optimized;

    ctx.emit({ type: 'section_progress', section: 'headline', status: 'complete' });

    return JSON.stringify({
      success: true,
      section: 'headline',
      char_count: optimized.optimized.length,
      word_count: optimized.word_count,
    });
  },
};

// ─── Tool: write_about ──────────────────────────────────────────────

const writeAboutTool: LinkedInOptimizerTool = {
  name: 'write_about',
  description:
    'Write an optimized LinkedIn About section following Rule 2. ' +
    'First person, 1,500-2,400 characters, career identity hook in first 300 characters, ' +
    '8-12 keywords woven naturally, call to action at the end. ' +
    'Call this after write_headline.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Run Analyzer first.' });
    }

    ctx.emit({ type: 'section_progress', section: 'about', status: 'writing' });

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a LinkedIn profile optimization expert for senior executives (45+).

${LINKEDIN_OPTIMIZER_RULES}

You have the following data about the candidate:

${contextBlock}`,
      messages: [{
        role: 'user',
        content: `Write an optimized LinkedIn About section following Rule 2.

Requirements:
- Write in FIRST PERSON ("I" statements)
- Open with a hook — career identity statement. If a Why-Me story is available, use it as the foundation.
- Structure: Hook (1-2 sentences) → Career pattern with 2-3 proof points → What excites you professionally (close)
- Include 8-12 high-value keywords woven naturally — do NOT keyword-stuff
- Minimum 1,500 characters, target 2,000-2,400 characters
- The first 300 characters must hook a recruiter (this is what shows before "see more")
- End with a call to action or professional aspiration
- Do NOT duplicate the resume — tell the story underneath the job titles

Return JSON:
{
  "about": "the full optimized about section text",
  "rationale": "what strategy was used, how keywords are distributed, how the hook works",
  "keywords_woven": ["keyword1", "keyword2", ...]
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        about: response.text.trim(),
        rationale: 'Generated from resume data and positioning strategy.',
        keywords_woven: [],
      };
    }

    const aboutText = String(result.about ?? '');

    const optimized: OptimizedSection = {
      section: 'about',
      original: state.current_profile?.about ?? '',
      optimized: aboutText,
      rationale: String(result.rationale ?? ''),
      word_count: wordCount(aboutText),
    };

    if (!state.sections) {
      state.sections = {} as LinkedInOptimizerState['sections'];
    }
    state.sections.about = optimized;

    ctx.emit({ type: 'section_progress', section: 'about', status: 'complete' });

    return JSON.stringify({
      success: true,
      section: 'about',
      char_count: aboutText.length,
      word_count: optimized.word_count,
      meets_minimum: aboutText.length >= 1500,
    });
  },
};

// ─── Tool: write_experience_entries ─────────────────────────────────

const writeExperienceEntriesTool: LinkedInOptimizerTool = {
  name: 'write_experience_entries',
  description:
    'Write optimized LinkedIn experience entries following Rule 3. ' +
    'Each role gets 3-5 bullet points or a short paragraph, led by impact statements. ' +
    'Complements (not duplicates) the resume. ' +
    'Call this after write_about.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Run Analyzer first.' });
    }

    ctx.emit({ type: 'section_progress', section: 'experience', status: 'writing' });

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 8192,
      system: `You are a LinkedIn profile optimization expert for senior executives (45+).

${LINKEDIN_OPTIMIZER_RULES}

You have the following data about the candidate:

${contextBlock}`,
      messages: [{
        role: 'user',
        content: `Write optimized LinkedIn experience entries following Rule 3.

Requirements:
- Write entries for each role in the work history
- Each entry: 3-5 bullet points OR a short paragraph (not both)
- Lead with the impact statement — what changed because you were there
- Include metrics where the resume supports them, framed conversationally
- Add context: team size, budget scope, geographic reach, reporting structure
- Most recent role: 4-6 points. Older roles: 2-3 points
- Use keywords naturally — experience section is heavily indexed
- Never contradict the resume — dates, titles, companies must match exactly
- Complement the resume, don't duplicate it — tell the story behind the title
- For each entry, score it on 4 dimensions (0-100): impact (led with what changed?), metrics (numbers present?), context (scope/size/structure given?), keywords (search terms woven in?)

Return a JSON object with this exact shape:
{
  "entries": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "Start - End",
      "optimized": "The optimized experience entry text as markdown bullets",
      "quality_scores": {
        "impact": 0-100,
        "metrics": 0-100,
        "context": 0-100,
        "keywords": 0-100
      }
    }
  ],
  "rationale": "overall approach and how entries complement the resume"
}`,
      }],
    });

    interface RawEntry {
      company?: string;
      title?: string;
      duration?: string;
      optimized?: string;
      /** Legacy field — some LLM responses use 'content' instead of 'optimized' */
      content?: string;
      quality_scores?: {
        impact?: number;
        metrics?: number;
        context?: number;
        keywords?: number;
      };
    }

    let result: { entries?: RawEntry[]; rationale?: string };
    try {
      result = repairJSON<typeof result>(response.text) ?? JSON.parse(response.text);
    } catch {
      result = {
        entries: [],
        rationale: response.text.trim(),
      };
    }

    const rawEntries: RawEntry[] = Array.isArray(result?.entries) ? result.entries : [];

    // Build per-role structured entries
    const experienceEntries: ExperienceEntry[] = rawEntries.map((e, idx) => {
      const entryText = String(e.optimized ?? e.content ?? '');
      const scores = e.quality_scores ?? {};
      return {
        role_id: `role_${idx}`,
        company: String(e.company ?? ''),
        title: String(e.title ?? ''),
        duration: String(e.duration ?? ''),
        original: '',  // Per-role originals are not parsed from the raw experience_text blob
        optimized: entryText,
        quality_scores: {
          impact: Number(scores.impact ?? 70),
          metrics: Number(scores.metrics ?? 70),
          context: Number(scores.context ?? 70),
          keywords: Number(scores.keywords ?? 70),
        },
      };
    });

    // Persist structured entries to state
    state.experience_entries = experienceEntries;

    // Assemble combined markdown for backward compatibility with assemble_report
    const combinedText = experienceEntries
      .map(e => `### ${e.title || 'Role'} at ${e.company || 'Company'} (${e.duration})\n\n${e.optimized}`)
      .join('\n\n');

    const optimized: OptimizedSection = {
      section: 'experience',
      original: state.current_profile?.experience_text ?? '',
      optimized: combinedText,
      rationale: String(result?.rationale ?? ''),
      word_count: wordCount(combinedText),
    };

    if (!state.sections) {
      state.sections = {} as LinkedInOptimizerState['sections'];
    }
    state.sections.experience = optimized;

    ctx.emit({ type: 'section_progress', section: 'experience', status: 'complete' });

    return JSON.stringify({
      success: true,
      section: 'experience',
      entries_count: experienceEntries.length,
      word_count: optimized.word_count,
    });
  },
};

// ─── Tool: optimize_keywords ────────────────────────────────────────

const optimizeKeywordsTool: LinkedInOptimizerTool = {
  name: 'optimize_keywords',
  description:
    'Generate an optimized Skills/Keywords list following Rule 4. ' +
    'Top 50 skills ordered by relevance to the target role. ' +
    'Includes full terms AND abbreviations. ' +
    'Call this after write_experience_entries.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();

    if (!state.resume_data) {
      return JSON.stringify({ success: false, error: 'No resume data available. Run Analyzer first.' });
    }

    ctx.emit({ type: 'section_progress', section: 'keywords', status: 'writing' });

    const contextBlock = buildContextBlock(state);

    // Also include what was written in other sections for keyword cross-reference
    const writtenSections: string[] = [];
    if (state.sections?.headline?.optimized) {
      writtenSections.push(`Headline: ${state.sections.headline.optimized}`);
    }
    if (state.sections?.about?.optimized) {
      writtenSections.push(`About (first 500 chars): ${state.sections.about.optimized.slice(0, 500)}`);
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: `You are a LinkedIn SEO expert who knows exactly what keywords recruiters search for. Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Generate an optimized LinkedIn Skills list following Rule 4.

${contextBlock}

${writtenSections.length > 0 ? `\nAlready written sections (check keyword coverage):\n${writtenSections.join('\n')}` : ''}

Requirements:
- Top 50 skills ordered by relevance to the target role
- Include both full terms AND common abbreviations (e.g., "Supply Chain Management", "SCM")
- Include industry-specific tools, methodologies, and frameworks by name
- Ensure the top 5 critical keywords appear 2-3 times across different sections
- Cross-reference with the keyword analysis — all missing keywords should be addressed

Return JSON:
{
  "skills": ["skill1", "skill2", ...],
  "keyword_distribution": {
    "in_headline": ["keyword1", "keyword2"],
    "in_about": ["keyword1", "keyword3"],
    "in_experience": ["keyword2", "keyword4"],
    "in_skills_only": ["keyword5", "keyword6"]
  },
  "coverage_improvement": "explanation of how keyword coverage improved from original",
  "new_coverage_score": 0-100
}`,
      }],
    });

    let result;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text);
    } catch {
      result = {
        skills: state.keyword_analysis?.recommended_keywords ?? state.resume_data.key_skills ?? [],
        keyword_distribution: {},
        coverage_improvement: 'Generated from resume skills and keyword analysis.',
        new_coverage_score: 70,
      };
    }

    const skills = Array.isArray(result.skills) ? result.skills : [];
    const skillsText = skills.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');

    const optimized: OptimizedSection = {
      section: 'keywords',
      original: state.keyword_analysis
        ? `Coverage: ${state.keyword_analysis.coverage_score}% | Present: ${state.keyword_analysis.present_keywords.join(', ')}`
        : '',
      optimized: skillsText,
      rationale: String(result.coverage_improvement ?? ''),
      word_count: skills.length,
    };

    if (!state.sections) {
      state.sections = {} as LinkedInOptimizerState['sections'];
    }
    state.sections.keywords = optimized;

    ctx.emit({ type: 'section_progress', section: 'keywords', status: 'complete' });

    return JSON.stringify({
      success: true,
      section: 'keywords',
      skills_count: skills.length,
      new_coverage_score: result.new_coverage_score ?? 0,
    });
  },
};

// ─── Tool: assemble_report ──────────────────────────────────────────

const assembleReportTool: LinkedInOptimizerTool = {
  name: 'assemble_report',
  description:
    'Assemble all optimized sections into the final LinkedIn optimization report. ' +
    'Runs the self-assessment checklist (Rule 7) and produces a quality score. ' +
    'Call this after all 4 sections have been written.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const sections = state.sections;

    if (!sections) {
      return JSON.stringify({ success: false, error: 'No sections have been written' });
    }

    const { SECTION_ORDER } = await import('../types.js');

    // Run self-assessment (Rule 7)
    const checks: string[] = [];
    let score = 100;

    // Check 1: Headline has keywords + value proposition
    if (sections.headline?.optimized) {
      if (sections.headline.optimized.length < 50) {
        checks.push('Headline is too short — should use more of the 220 character limit');
        score -= 10;
      }
    } else {
      checks.push('Headline section is missing');
      score -= 25;
    }

    // Check 2: About section length
    if (sections.about?.optimized) {
      if (sections.about.optimized.length < 1500) {
        checks.push(`About section is ${sections.about.optimized.length} chars — minimum is 1,500`);
        score -= 15;
      }
    } else {
      checks.push('About section is missing');
      score -= 25;
    }

    // Check 3: Experience section exists
    if (!sections.experience?.optimized) {
      checks.push('Experience section is missing');
      score -= 25;
    }

    // Check 4: Keywords section exists
    if (!sections.keywords?.optimized) {
      checks.push('Keywords/Skills section is missing');
      score -= 15;
    }

    // Assemble report
    const parts: string[] = [];
    const candidateName = state.resume_data?.name ?? 'Candidate';
    const targetRole = state.target_context?.target_role ?? state.resume_data?.current_title ?? 'Target Role';

    parts.push('# LinkedIn Profile Optimization Report');
    parts.push('');
    parts.push(`**Candidate:** ${candidateName}`);
    parts.push(`**Target Role:** ${targetRole}`);
    if (state.target_context?.target_industry) {
      parts.push(`**Industry:** ${state.target_context.target_industry}`);
    }
    parts.push(`**Quality Score:** ${Math.max(0, score)}%`);
    parts.push('');
    parts.push('---');
    parts.push('');

    let totalWords = 0;
    let sectionsIncluded = 0;

    for (const sectionKey of SECTION_ORDER) {
      const section = sections[sectionKey];
      if (!section?.optimized) continue;

      const sectionLabel = sectionKey === 'headline' ? 'Headline'
        : sectionKey === 'about' ? 'About Section'
        : sectionKey === 'experience' ? 'Experience Entries'
        : 'Skills & Keywords';

      parts.push(`## ${sectionLabel}`);
      parts.push('');

      if (section.original && sectionKey !== 'keywords') {
        parts.push('### Current');
        parts.push(section.original || '*(empty)*');
        parts.push('');
        parts.push('### Optimized');
      }

      parts.push(section.optimized);
      parts.push('');

      if (section.rationale) {
        parts.push(`> **Why this works:** ${section.rationale}`);
        parts.push('');
      }

      parts.push('---');
      parts.push('');

      totalWords += section.word_count;
      sectionsIncluded++;
    }

    // Self-assessment notes
    if (checks.length > 0) {
      parts.push('## Quality Notes');
      parts.push('');
      for (const check of checks) {
        parts.push(`- ${check}`);
      }
      parts.push('');
    }

    const finalReport = parts.join('\n');
    const qualityScore = Math.max(0, score);

    state.final_report = finalReport;
    state.quality_score = qualityScore;

    return JSON.stringify({
      success: true,
      total_words: totalWords,
      sections_included: sectionsIncluded,
      quality_score: qualityScore,
      quality_checks: checks,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const writerTools: LinkedInOptimizerTool[] = [
  writeHeadlineTool,
  writeAboutTool,
  writeExperienceEntriesTool,
  optimizeKeywordsTool,
  assembleReportTool,
];
