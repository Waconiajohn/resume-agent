/**
 * LinkedIn Optimizer Writer — Tool definitions.
 *
 * 5 tools:
 * - write_headline: Produce 3 headline options stored as structured JSON
 * - write_about: Produce About section rewrite stored as structured JSON
 * - write_experience_entries: Produce experience alignment guidance as structured JSON
 * - optimize_keywords: Produce skills/featured recommendations as structured JSON
 * - assemble_report: Assemble the full LinkedInAuditReport from scratchpad pieces
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  LinkedInOptimizerState,
  LinkedInOptimizerSSEEvent,
  OptimizedSection,
  ExperienceEntry,
  LinkedInAuditReport,
} from '../types.js';
import { LINKEDIN_OPTIMIZER_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderCareerNarrativeSection,
  renderEvidenceInventorySection,
  renderWhyMeStorySection,
} from '../../../contracts/shared-context-prompt.js';

type LinkedInOptimizerTool = AgentTool<LinkedInOptimizerState, LinkedInOptimizerSSEEvent>;

// ─── Helpers ────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '')).filter(Boolean);
}

function safeString(value: unknown, fallback = ''): string {
  if (value == null) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 5): number {
  const n = Number(value);
  return isNaN(n) ? fallback : Math.max(1, Math.min(10, n));
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

// ─── Tool: write_headline ───────────────────────────────────────────

const writeHeadlineTool: LinkedInOptimizerTool = {
  name: 'write_headline',
  description:
    'Write 3 optimized LinkedIn headline options following Rule 1 (Headline Optimization). ' +
    'Maximum 220 characters each. Leads with value proposition, includes 2-3 high-value keywords, ' +
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
        content: `Write 3 optimized LinkedIn headline options following Rule 1.

Requirements for each headline:
- Maximum 220 characters — use available space
- Lead with the VALUE PROPOSITION, not the job title
- Include 2-3 high-value keywords that recruiters search for
- Add a proof point with a metric if space allows
- Use pipe (|) or bullet (·) to separate clusters if needed
- No buzzwords without substance

Return JSON:
{
  "options": [
    { "label": "Option A — Strongest Overall", "headline": "headline text", "why_it_works": "explanation" },
    { "label": "Option B — More Magnetic", "headline": "headline text", "why_it_works": "explanation" },
    { "label": "Option C — ATS Optimized", "headline": "headline text", "why_it_works": "explanation" }
  ],
  "recommended_headline": "the exact headline text from options that you recommend",
  "recommended_headline_rationale": "why this is the strongest choice for this candidate"
}`,
      }],
    });

    interface HeadlineOption {
      label?: unknown;
      headline?: unknown;
      why_it_works?: unknown;
    }

    interface HeadlineResult {
      options?: HeadlineOption[];
      recommended_headline?: unknown;
      recommended_headline_rationale?: unknown;
    }

    let result: HeadlineResult;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text) as HeadlineResult;
    } catch {
      const text = response.text.trim();
      result = {
        options: [
          { label: 'Option A — Strongest Overall', headline: text.slice(0, 220), why_it_works: 'Generated from resume data and keyword analysis.' },
          { label: 'Option B — More Magnetic', headline: text.slice(0, 220), why_it_works: 'Generated from resume data and keyword analysis.' },
          { label: 'Option C — ATS Optimized', headline: text.slice(0, 220), why_it_works: 'Generated from resume data and keyword analysis.' },
        ],
        recommended_headline: text.slice(0, 220),
        recommended_headline_rationale: 'Generated from resume data.',
      };
    }

    const rawOptions = Array.isArray(result.options) ? result.options : [];
    const options = rawOptions.map((o) => ({
      label: safeString(o.label, 'Option'),
      headline: safeString(o.headline).slice(0, 220),
      why_it_works: safeString(o.why_it_works),
    }));

    const headlineRecommendations: LinkedInAuditReport['headline_recommendations'] = {
      options,
      recommended_headline: safeString(result.recommended_headline, options[0]?.headline ?? '').slice(0, 220),
      recommended_headline_rationale: safeString(result.recommended_headline_rationale),
    };

    ctx.scratchpad.headline_recommendations = headlineRecommendations;

    // Also write legacy OptimizedSection for backward compat
    const topHeadline = headlineRecommendations.recommended_headline;
    const optimized: OptimizedSection = {
      section: 'headline',
      original: state.current_profile?.headline ?? '',
      optimized: topHeadline,
      rationale: headlineRecommendations.recommended_headline_rationale,
      word_count: wordCount(topHeadline),
    };

    if (!state.sections) {
      state.sections = {} as LinkedInOptimizerState['sections'];
    }
    state.sections.headline = optimized;

    ctx.emit({ type: 'section_progress', section: 'headline', status: 'complete' });

    return JSON.stringify({
      success: true,
      section: 'headline',
      options_count: options.length,
      recommended_char_count: topHeadline.length,
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
  "five_second_hook_analysis": "honest assessment of whether the current opening hooks a recruiter in 5 seconds and what the candidate is doing wrong",
  "recommended_opening": "the magnetic 2-sentence opener that frames a business problem before introducing the candidate",
  "full_rewritten_about": "the complete optimized about section text in first person, minimum 1500 characters"
}`,
      }],
    });

    interface AboutResult {
      five_second_hook_analysis?: unknown;
      recommended_opening?: unknown;
      full_rewritten_about?: unknown;
    }

    let result: AboutResult;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text) as AboutResult;
    } catch {
      result = {
        five_second_hook_analysis: 'Unable to assess current opening.',
        recommended_opening: '',
        full_rewritten_about: response.text.trim(),
      };
    }

    const aboutSectionRewrite: LinkedInAuditReport['about_section_rewrite'] = {
      five_second_hook_analysis: safeString(result.five_second_hook_analysis),
      recommended_opening: safeString(result.recommended_opening),
      full_rewritten_about: safeString(result.full_rewritten_about),
    };

    ctx.scratchpad.about_section_rewrite = aboutSectionRewrite;

    const aboutText = aboutSectionRewrite.full_rewritten_about;

    const optimized: OptimizedSection = {
      section: 'about',
      original: state.current_profile?.about ?? '',
      optimized: aboutText,
      rationale: aboutSectionRewrite.five_second_hook_analysis,
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
    'Write optimized LinkedIn experience entries following Rule 3 AND produce experience alignment guidance. ' +
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
        content: `Write optimized LinkedIn experience entries following Rule 3, and provide alignment guidance.

Requirements for entries:
- Write entries for each role in the work history
- Each entry: 3-5 bullet points OR a short paragraph (not both)
- Lead with the impact statement — what changed because you were there
- Include metrics where the resume supports them, framed conversationally
- Add context: team size, budget scope, geographic reach, reporting structure
- Most recent role: 4-6 points. Older roles: 2-3 points
- Use keywords naturally — experience section is heavily indexed
- Never contradict the resume — dates, titles, companies must match exactly
- Complement the resume, don't duplicate it — tell the story behind the title
- For each entry, score it on 4 dimensions (0-100): impact, metrics, context, keywords

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
  "rationale": "overall approach",
  "resume_strengths_to_surface_more": ["strength 1 that is on resume but buried on LinkedIn", "strength 2", ...],
  "claims_that_need_stronger_proof": ["claim that lacks specific metrics or evidence", ...],
  "recommended_experience_reframing": ["specific rewrite suggestion for bullet or section", ...]
}`,
      }],
    });

    interface RawEntry {
      company?: string;
      title?: string;
      duration?: string;
      optimized?: string;
      content?: string;
      quality_scores?: {
        impact?: number;
        metrics?: number;
        context?: number;
        keywords?: number;
      };
    }

    interface ExperienceResult {
      entries?: RawEntry[];
      rationale?: string;
      resume_strengths_to_surface_more?: unknown[];
      claims_that_need_stronger_proof?: unknown[];
      recommended_experience_reframing?: unknown[];
    }

    let result: ExperienceResult;
    try {
      result = (repairJSON<ExperienceResult>(response.text) ?? JSON.parse(response.text)) as ExperienceResult;
    } catch {
      result = {
        entries: [],
        rationale: response.text.trim(),
        resume_strengths_to_surface_more: [],
        claims_that_need_stronger_proof: [],
        recommended_experience_reframing: [],
      };
    }

    const rawEntries: RawEntry[] = Array.isArray(result?.entries) ? result.entries : [];

    const experienceEntries: ExperienceEntry[] = rawEntries.map((e, idx) => {
      const entryText = (e.optimized ?? e.content ?? '');
      const scores = e.quality_scores ?? {};
      return {
        role_id: `role_${idx}`,
        company: (e.company ?? ''),
        title: (e.title ?? ''),
        duration: (e.duration ?? ''),
        original: '',
        optimized: entryText,
        quality_scores: {
          impact: (scores.impact ?? 70),
          metrics: (scores.metrics ?? 70),
          context: (scores.context ?? 70),
          keywords: (scores.keywords ?? 70),
        },
      };
    });

    state.experience_entries = experienceEntries;

    const experienceAlignment: LinkedInAuditReport['experience_alignment'] = {
      resume_strengths_to_surface_more: safeStringArray(result.resume_strengths_to_surface_more),
      claims_that_need_stronger_proof: safeStringArray(result.claims_that_need_stronger_proof),
      recommended_experience_reframing: safeStringArray(result.recommended_experience_reframing),
    };

    ctx.scratchpad.experience_alignment = experienceAlignment;

    // Assemble combined markdown for backward compat
    const combinedText = experienceEntries
      .map(e => `### ${e.title || 'Role'} at ${e.company || 'Company'} (${e.duration})\n\n${e.optimized}`)
      .join('\n\n');

    const optimized: OptimizedSection = {
      section: 'experience',
      original: state.current_profile?.experience_text ?? '',
      optimized: combinedText,
      rationale: (result?.rationale ?? ''),
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
    'Generate an optimized Skills/Keywords list following Rule 4, plus Featured section ideas. ' +
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
        content: `Generate an optimized LinkedIn Skills list following Rule 4, plus Featured section recommendations.

${contextBlock}

${writtenSections.length > 0 ? `\nAlready written sections (check keyword coverage):\n${writtenSections.join('\n')}` : ''}

Requirements:
- Top 50 skills ordered by relevance to the target role
- Include both full terms AND common abbreviations
- Include industry-specific tools, methodologies, and frameworks by name
- Ensure the top 5 critical keywords appear 2-3 times across different sections
- Cross-reference with the keyword analysis — all missing keywords should be addressed

Return JSON:
{
  "skills": ["skill1", "skill2", ...],
  "top_skills_to_pin": ["skill1", "skill2", "skill3"],
  "skills_to_add_or_emphasize": ["missing skill 1", "underemphasized skill 2", ...],
  "featured_section_recommendations": ["Featured idea: publish or pin this content", ...],
  "coverage_improvement": "explanation of how keyword coverage improved",
  "new_coverage_score": 0-100
}`,
      }],
    });

    interface KeywordsResult {
      skills?: unknown[];
      top_skills_to_pin?: unknown[];
      skills_to_add_or_emphasize?: unknown[];
      featured_section_recommendations?: unknown[];
      coverage_improvement?: unknown;
      new_coverage_score?: unknown;
    }

    let result: KeywordsResult;
    try {
      result = JSON.parse(repairJSON(response.text) ?? response.text) as KeywordsResult;
    } catch {
      result = {
        skills: state.keyword_analysis?.recommended_keywords ?? state.resume_data.key_skills ?? [],
        top_skills_to_pin: [],
        skills_to_add_or_emphasize: [],
        featured_section_recommendations: [],
        coverage_improvement: 'Generated from resume skills and keyword analysis.',
        new_coverage_score: 70,
      };
    }

    const skills = Array.isArray(result.skills) ? result.skills.map(String) : [];
    const skillsText = skills.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');

    const skillsRecommendations: LinkedInAuditReport['skills_and_featured_recommendations'] = {
      top_skills_to_pin: safeStringArray(result.top_skills_to_pin),
      skills_to_add_or_emphasize: safeStringArray(result.skills_to_add_or_emphasize),
      featured_section_recommendations: safeStringArray(result.featured_section_recommendations),
    };

    ctx.scratchpad.skills_recommendations = skillsRecommendations;

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
    'Assemble all structured data into the full LinkedInAuditReport JSON. ' +
    'Runs the self-assessment checklist (Rule 7), computes weighted audit scores, ' +
    'and generates positioning summary and benchmark assessment. ' +
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

    // Retrieve structured pieces from scratchpad
    const headlineRec = (ctx.scratchpad.headline_recommendations as LinkedInAuditReport['headline_recommendations'] | undefined)
      ?? {
        options: [
          { label: 'Option A', headline: sections.headline?.optimized ?? '', why_it_works: sections.headline?.rationale ?? '' },
        ],
        recommended_headline: sections.headline?.optimized ?? '',
        recommended_headline_rationale: sections.headline?.rationale ?? '',
      };

    const aboutRec = (ctx.scratchpad.about_section_rewrite as LinkedInAuditReport['about_section_rewrite'] | undefined)
      ?? {
        five_second_hook_analysis: sections.about?.rationale ?? '',
        recommended_opening: (sections.about?.optimized ?? '').slice(0, 300),
        full_rewritten_about: sections.about?.optimized ?? '',
      };

    const experienceRec = (ctx.scratchpad.experience_alignment as LinkedInAuditReport['experience_alignment'] | undefined)
      ?? {
        resume_strengths_to_surface_more: [],
        claims_that_need_stronger_proof: [],
        recommended_experience_reframing: [],
      };

    const skillsRec = (ctx.scratchpad.skills_recommendations as LinkedInAuditReport['skills_and_featured_recommendations'] | undefined)
      ?? {
        top_skills_to_pin: [],
        skills_to_add_or_emphasize: state.keyword_analysis?.missing_keywords ?? [],
        featured_section_recommendations: [],
      };

    // Self-assessment checks (Rule 7)
    let qualityScore = 100;
    if (sections.headline?.optimized) {
      if (sections.headline.optimized.length < 50) qualityScore -= 10;
    } else {
      qualityScore -= 25;
    }
    if (sections.about?.optimized) {
      if (sections.about.optimized.length < 1500) qualityScore -= 15;
    } else {
      qualityScore -= 25;
    }
    if (!sections.experience?.optimized) qualityScore -= 25;
    if (!sections.keywords?.optimized) qualityScore -= 15;
    qualityScore = Math.max(0, qualityScore);

    // Build prompt to generate the scoring and positioning summary
    const candidateName = state.resume_data?.name ?? 'Candidate';
    const targetRole = state.target_context?.target_role ?? state.resume_data?.current_title ?? 'Target Role';
    const profileStrengths = state.profile_analysis?.strengths ?? [];
    const profileGaps = state.profile_analysis?.positioning_gaps ?? [];

    const auditPrompt = `You are a LinkedIn profile auditor. Generate the positioning summary and benchmark assessment for this candidate.

Candidate: ${candidateName}
Target Role: ${targetRole}
Profile Strengths: ${profileStrengths.join(', ') || 'Not specified'}
Profile Gaps: ${profileGaps.join(', ') || 'Not specified'}
Quality Score: ${qualityScore}%

Headline: ${headlineRec.recommended_headline}
About Opening: ${aboutRec.recommended_opening}

Return JSON:
{
  "positioning_summary": {
    "core_identity": "one sentence: who this person fundamentally is",
    "value_proposition": "one sentence: what expensive problem they solve",
    "differentiators": ["differentiator 1", "differentiator 2", "differentiator 3"],
    "target_market_fit": "one sentence: why they are a natural fit for target roles"
  },
  "audit_scores": {
    "five_second_test": 1-10,
    "headline_strength": 1-10,
    "about_hook_strength": 1-10,
    "proof_strength": 1-10,
    "differentiation_strength": 1-10,
    "executive_presence": 1-10,
    "keyword_effectiveness": 1-10
  },
  "diagnostic_findings": {
    "what_is_working": ["strength 1", "strength 2", ...],
    "what_is_weak": ["weakness 1", "weakness 2", ...],
    "what_is_missing": ["missing element 1", "missing element 2", ...],
    "where_profile_undersells_candidate": ["undersell 1", "undersell 2", ...]
  },
  "final_benchmark_assessment": {
    "benchmark_candidate_summary": "2-3 sentences on whether this candidate is benchmark level and why",
    "confidence": 0.00-1.00,
    "key_caveats": ["caveat 1", "caveat 2"]
  }
}`;

    interface ScoringResult {
      positioning_summary?: {
        core_identity?: unknown;
        value_proposition?: unknown;
        differentiators?: unknown[];
        target_market_fit?: unknown;
      };
      audit_scores?: {
        five_second_test?: unknown;
        headline_strength?: unknown;
        about_hook_strength?: unknown;
        proof_strength?: unknown;
        differentiation_strength?: unknown;
        executive_presence?: unknown;
        keyword_effectiveness?: unknown;
      };
      diagnostic_findings?: {
        what_is_working?: unknown[];
        what_is_weak?: unknown[];
        what_is_missing?: unknown[];
        where_profile_undersells_candidate?: unknown[];
      };
      final_benchmark_assessment?: {
        benchmark_candidate_summary?: unknown;
        confidence?: unknown;
        key_caveats?: unknown[];
      };
    }

    let scoring: ScoringResult = {};
    try {
      const scoringResponse = await llm.chat({
        model: MODEL_MID,
        max_tokens: 2048,
        system: 'You are a LinkedIn profile auditor. Return only valid JSON.',
        messages: [{ role: 'user', content: auditPrompt }],
      });
      scoring = JSON.parse(repairJSON(scoringResponse.text) ?? scoringResponse.text) as ScoringResult;
    } catch {
      // Fallback scoring
      scoring = {
        positioning_summary: {
          core_identity: `${candidateName} is a senior executive with deep expertise in ${targetRole}-related domains.`,
          value_proposition: `Solves enterprise-scale execution challenges through proven operational leadership.`,
          differentiators: profileStrengths.slice(0, 3),
          target_market_fit: `Strong alignment with ${targetRole} requirements based on career trajectory.`,
        },
        audit_scores: {
          five_second_test: 5,
          headline_strength: 5,
          about_hook_strength: 5,
          proof_strength: 5,
          differentiation_strength: 5,
          executive_presence: 5,
          keyword_effectiveness: 5,
        },
        diagnostic_findings: {
          what_is_working: profileStrengths,
          what_is_weak: profileGaps,
          what_is_missing: [],
          where_profile_undersells_candidate: [],
        },
        final_benchmark_assessment: {
          benchmark_candidate_summary: 'Assessment based on available resume data.',
          confidence: qualityScore / 100,
          key_caveats: profileGaps,
        },
      };
    }

    // Build the individual scores with weighted overall
    const s = scoring.audit_scores ?? {};
    const fiveSecond = safeNumber(s.five_second_test);
    const headlineStr = safeNumber(s.headline_strength);
    const aboutHook = safeNumber(s.about_hook_strength);
    const proofStr = safeNumber(s.proof_strength);
    const diffStr = safeNumber(s.differentiation_strength);
    const execPres = safeNumber(s.executive_presence);
    const kwEff = safeNumber(s.keyword_effectiveness);
    const overallScore = Math.round(
      fiveSecond * 0.20 +
      headlineStr * 0.15 +
      aboutHook * 0.20 +
      proofStr * 0.15 +
      diffStr * 0.15 +
      execPres * 0.10 +
      kwEff * 0.05
    );

    const ps = scoring.positioning_summary ?? {};
    const df = scoring.diagnostic_findings ?? {};
    const fa = scoring.final_benchmark_assessment ?? {};

    const auditReport: LinkedInAuditReport = {
      positioning_summary: {
        core_identity: safeString(ps.core_identity),
        value_proposition: safeString(ps.value_proposition),
        differentiators: safeStringArray(ps.differentiators),
        target_market_fit: safeString(ps.target_market_fit),
      },
      audit_scores: {
        five_second_test: fiveSecond,
        headline_strength: headlineStr,
        about_hook_strength: aboutHook,
        proof_strength: proofStr,
        differentiation_strength: diffStr,
        executive_presence: execPres,
        keyword_effectiveness: kwEff,
        overall_score: overallScore,
      },
      diagnostic_findings: {
        what_is_working: safeStringArray(df.what_is_working),
        what_is_weak: safeStringArray(df.what_is_weak),
        what_is_missing: safeStringArray(df.what_is_missing),
        where_profile_undersells_candidate: safeStringArray(df.where_profile_undersells_candidate),
      },
      headline_recommendations: headlineRec,
      about_section_rewrite: aboutRec,
      experience_alignment: experienceRec,
      skills_and_featured_recommendations: skillsRec,
      final_benchmark_assessment: {
        benchmark_candidate_summary: safeString(fa.benchmark_candidate_summary),
        confidence: Math.max(0, Math.min(1, Number(fa.confidence ?? 0.7))),
        key_caveats: safeStringArray(fa.key_caveats),
      },
    };

    ctx.scratchpad.audit_report = auditReport;

    // Assemble backward-compatible markdown report
    const parts: string[] = [];
    parts.push('# LinkedIn Profile Optimization Report');
    parts.push('');
    parts.push(`**Candidate:** ${candidateName}`);
    parts.push(`**Target Role:** ${targetRole}`);
    parts.push(`**Overall Score:** ${overallScore}/10`);
    parts.push(`**Quality Score:** ${qualityScore}%`);
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

    const finalReport = parts.join('\n');

    ctx.scratchpad.final_report = finalReport;
    ctx.scratchpad.quality_score = qualityScore;

    return JSON.stringify({
      success: true,
      total_words: totalWords,
      sections_included: sectionsIncluded,
      quality_score: qualityScore,
      overall_score: overallScore,
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
