/**
 * Interview Prep Writer — Tool definitions.
 *
 * 4 tools:
 * - write_section: Write a single section of the interview prep report
 * - self_review_section: Quality check a written section against Rule 9
 * - build_career_story: Special handler for the Why Me section (Rule 6)
 * - assemble_report: Combine all sections into the final document
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  InterviewPrepState,
  InterviewPrepSSEEvent,
  InterviewPrepSection,
  WrittenSection,
} from '../types.js';
import { INTERVIEW_PREP_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import { renderWhyMeStorySection } from '../../../contracts/shared-context-prompt.js';

type InterviewPrepTool = AgentTool<InterviewPrepState, InterviewPrepSSEEvent>;

// ─── Helpers ────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function buildContextBlock(state: InterviewPrepState): string {
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

  if (state.jd_analysis) {
    parts.push('\n## Job Description Analysis');
    parts.push(`Company: ${state.jd_analysis.company_name}`);
    parts.push(`Role: ${state.jd_analysis.role_title}`);
    parts.push(`Seniority: ${state.jd_analysis.seniority_level}`);
    if (state.jd_analysis.requirements.length > 0) {
      parts.push('Top Requirements (ranked):');
      for (const r of state.jd_analysis.requirements) {
        parts.push(`${r.rank}. ${r.requirement} — ${r.expanded_definition}`);
      }
    }
    if (state.jd_analysis.culture_cues.length > 0) {
      parts.push(`Culture Cues: ${state.jd_analysis.culture_cues.join(', ')}`);
    }
  }

  if (state.company_research) {
    parts.push('\n## Company Research');
    parts.push(state.company_research.overview);
    if (state.company_research.growth_areas.length > 0) {
      parts.push('Growth Areas:');
      for (const g of state.company_research.growth_areas) parts.push(`- ${g}`);
    }
    if (state.company_research.risks.length > 0) {
      parts.push('Risks:');
      for (const r of state.company_research.risks) parts.push(`- ${r}`);
    }
    if (state.company_research.competitors.length > 0) {
      parts.push('Competitors:');
      for (const c of state.company_research.competitors) {
        parts.push(`- ${c.name}: ${c.differentiation}`);
      }
    }
  }

  if (state.sourced_questions && state.sourced_questions.length > 0) {
    parts.push('\n## Sourced Interview Questions');
    for (const q of state.sourced_questions) {
      parts.push(`- [${q.category}] ${q.question} (source: ${q.source})`);
    }
  }

  if (state.platform_context?.why_me_story) {
    parts.push(...renderWhyMeStorySection({
      heading: '## Why-Me Story (from CareerIQ)',
      legacyWhyMeStory: state.platform_context.why_me_story,
    }));
  }

  return parts.join('\n');
}

// Section-specific writing instructions
const SECTION_INSTRUCTIONS: Record<InterviewPrepSection, string> = {
  company_research: 'Write Section 1: Company Research. Use the research data provided. Include Overview, Growth Areas, Potential Risks, and Competitors. Be specific — name actual products, services, numbers. No tables.',
  elevator_pitch: 'Write Section 2: Elevator Pitch. 60-90 seconds, first person. Open with identity statement, 2-3 proof points with metrics from resume, connect to this specific company, close with genuine enthusiasm for THIS role.',
  requirements_fit: 'Write Section 3: Why I\'m the Perfect Fit. Extract the top 4-6 requirements from the JD analysis. For each: state as header, expand the definition, write 3-5 first-person sentences with specific resume evidence (metrics, project names, team sizes). "I have experience with X" is NEVER acceptable.',
  technical_questions: 'Write Section 4: Technical/Role-Specific Interview Questions. Minimum 8 questions. Use the sourced questions where available. Each answer: 5-8 sentences minimum, first person, references specific resume experiences with metrics. Answers should be speakable aloud.',
  behavioral_questions: 'Write Section 5: Behavioral STAR Questions. Minimum 8 questions. Full STAR format per Rule 3. Each answer MINIMUM 12 sentences. Action section must be 40-60% of total. Use "I" statements. Quantified results. Map to competencies from the JD.',
  three_two_one: 'Write Section 6: The 3-2-1 Strategy. 3 proof points (2-3 sentences each with metrics), 2 smart questions specific to THIS company\'s real business (not generic), 1 strong closing statement with a template for referencing interview discussion.',
  why_me: 'Write Section 7: Why Me — My Career Story. This is the MOST IMPORTANT section. Find the career PATTERN — an archetype identity. "I am a [builder/fixer/translator/etc]." Write 200-400 words as narrative, NOT bullet points. 2-3 proof points across different roles. Connect to what THIS company needs. If insufficient resume detail, generate 5-7 discovery questions instead.',
  thirty_sixty_ninety: 'Write Section 8: 30-60-90 Day Plan. EXTENSIVE and SPECIFIC — not vague platitudes. 4-6 actions per phase, each a full sentence. Name specific systems, tools, processes from the JD. Connect to job requirements.',
  final_tips: 'Write Section 9: Final Interview Tips. 6-10 practical, senior-level tips tailored to THIS role and company. Include company-specific prep reminders, executive delivery advice, strategic framing guidance, storytelling reminders.',
};

// ─── Tool: write_section ────────────────────────────────────────────

const writeSectionTool: InterviewPrepTool = {
  name: 'write_section',
  description:
    'Write a single section of the interview preparation report. ' +
    'Follows the 11 quality rules for interview prep documents. ' +
    'Each section must be written in first person, tailored to the target company, ' +
    'and meet minimum length requirements. Call this for each of the 9 sections in order.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Which section to write',
        enum: [
          'company_research', 'elevator_pitch', 'requirements_fit',
          'technical_questions', 'behavioral_questions', 'three_two_one',
          'why_me', 'thirty_sixty_ninety', 'final_tips',
        ],
      },
    },
    required: ['section'],
  },
  async execute(input, ctx) {
    const section = String(input.section) as InterviewPrepSection;
    const state = ctx.getState();
    const instruction = SECTION_INSTRUCTIONS[section];

    if (!instruction) {
      return JSON.stringify({ success: false, error: `Unknown section: ${section}` });
    }

    ctx.emit({
      type: 'section_progress',
      section,
      status: 'writing',
    });

    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 8192,
      system: `You are an expert interview preparation coach writing a comprehensive interview prep document for a senior executive. Everything you write must be in FIRST PERSON — as if the candidate is speaking.

${INTERVIEW_PREP_RULES}

You have access to the following data about the candidate, company, and role:

${contextBlock}`,
      messages: [{
        role: 'user',
        content: instruction,
      }],
    });

    const content = response.text;
    const wc = wordCount(content);

    const written: WrittenSection = {
      section,
      content,
      reviewed: false,
      word_count: wc,
    };

    // Store in state
    if (!state.sections) {
      state.sections = {} as InterviewPrepState['sections'];
    }
    state.sections[section] = written;

    return JSON.stringify({
      success: true,
      section,
      word_count: wc,
      needs_review: true,
    });
  },
};

// ─── Tool: self_review_section ──────────────────────────────────────

const selfReviewSectionTool: InterviewPrepTool = {
  name: 'self_review_section',
  description:
    'Quality-check a written section against the interview prep rules. ' +
    'Checks minimum lengths, STAR depth, company tailoring, executive framing, ' +
    'and specificity. If issues are found, rewrites the section. ' +
    'Call this after write_section for each section.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      section: {
        type: 'string',
        description: 'Which section to review',
        enum: [
          'company_research', 'elevator_pitch', 'requirements_fit',
          'technical_questions', 'behavioral_questions', 'three_two_one',
          'why_me', 'thirty_sixty_ninety', 'final_tips',
        ],
      },
    },
    required: ['section'],
  },
  async execute(input, ctx) {
    const section = String(input.section) as InterviewPrepSection;
    const state = ctx.getState();
    const written = state.sections?.[section];

    if (!written) {
      return JSON.stringify({ success: false, error: `Section ${section} has not been written yet` });
    }

    ctx.emit({
      type: 'section_progress',
      section,
      status: 'reviewing',
    });

    const reviewResponse = await llm.chat({
      model: MODEL_MID,
      max_tokens: 4096,
      system: `You are a quality reviewer for interview preparation documents serving senior executives (45+). Review the section against these criteria and return JSON.

Key rules to check:
- Rule 2: Minimum lengths met? (STAR answers: 12+ sentences each, Action 40%+ of total; technical answers: 5-8 sentences; elevator pitch: 100-150 words; Why Me: 200-400 words)
- Rule 3: STAR answers have explicit Situation/Task/Action/Result labels? Action is the longest section?
- Rule 4: Answers tailored to the specific company (not generic)?
- Rule 5: Executive-level framing (strategic impact, not task completion)?
- Rule 6: Why Me is a narrative identity story, not a resume summary?
- Rule 9: Every answer references specific resume evidence?

Return JSON:
{
  "passed": true/false,
  "issues": ["issue 1", "issue 2"],
  "score": 0-100,
  "needs_rewrite": true/false
}`,
      messages: [{
        role: 'user',
        content: `Review this "${section}" section:\n\n${written.content}`,
      }],
    });

    let review;
    try {
      review = JSON.parse(repairJSON(reviewResponse.text) ?? reviewResponse.text);
    } catch {
      review = { passed: true, issues: [], score: 75, needs_rewrite: false };
    }

    if (review.needs_rewrite && !written.reviewed) {
      // Rewrite the section addressing the issues
      const contextBlock = buildContextBlock(state);
      const rewriteResponse = await llm.chat({
        model: MODEL_PRIMARY,
        max_tokens: 8192,
        system: `You are rewriting an interview prep section that failed quality review. Fix ALL issues listed below. Everything in first person.

${INTERVIEW_PREP_RULES}

Candidate/Company/Role data:
${contextBlock}`,
        messages: [{
          role: 'user',
          content: `Rewrite this section to fix these issues:
${review.issues.map((i: string) => `- ${i}`).join('\n')}

Original section:
${written.content}

${SECTION_INSTRUCTIONS[section]}`,
        }],
      });

      const rewrittenContent = rewriteResponse.text;
      state.sections[section] = {
        section,
        content: rewrittenContent,
        reviewed: true,
        review_notes: review.issues.join('; '),
        word_count: wordCount(rewrittenContent),
      };

      ctx.emit({ type: 'section_progress', section, status: 'complete' });

      return JSON.stringify({
        success: true,
        section,
        action: 'rewritten',
        original_score: review.score,
        issues_fixed: review.issues.length,
      });
    }

    // Mark as reviewed
    written.reviewed = true;
    written.review_notes = review.issues?.length > 0 ? review.issues.join('; ') : undefined;

    ctx.emit({ type: 'section_progress', section, status: 'complete' });

    return JSON.stringify({
      success: true,
      section,
      action: 'approved',
      score: review.score,
      issues: review.issues,
    });
  },
};

// ─── Tool: build_career_story ───────────────────────────────────────

const buildCareerStoryTool: InterviewPrepTool = {
  name: 'build_career_story',
  description:
    'Special tool for the "Why Me" section. Analyzes the resume to find a career identity ' +
    'pattern (builder, fixer, translator, etc.) and writes a 200-400 word narrative story. ' +
    'If the resume lacks sufficient detail, generates discovery questions instead. ' +
    'Call this INSTEAD of write_section for the why_me section.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      attempt_story: {
        type: 'boolean',
        description: 'Whether to attempt the story (true) or go straight to discovery questions (false)',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const resumeData = state.resume_data;
    const jdAnalysis = state.jd_analysis;
    const whyMe = state.platform_context?.why_me_story;

    ctx.emit({ type: 'section_progress', section: 'why_me', status: 'writing' });

    // Check if we have enough resume detail for a story
    const hasWorkHistory = (resumeData?.work_history?.length ?? 0) >= 2;
    const hasAchievements = (resumeData?.key_achievements?.length ?? 0) >= 3;
    const hasWhyMe = !!(whyMe?.colleaguesCameForWhat || whyMe?.knownForWhat);
    const hasSufficientDetail = hasWorkHistory && (hasAchievements || hasWhyMe);

    if (!hasSufficientDetail && input.attempt_story !== true) {
      // Generate discovery questions per Rule 6 fallback
      const questions = [
        'What is the accomplishment you are most proud of in your career, and why does it matter to you personally?',
        'Describe a time you were thrown into a situation where nobody thought you could succeed — what happened and what did you do?',
        'What do people consistently come to you for — across every job you have ever held?',
        'If a former colleague were describing you to someone who has never met you, what would they say makes you different from everyone else they have worked with?',
        'What pattern do you see across your career — what is the common thread that connects every role, even when the industries or titles were different?',
        'When you look at your career as a whole, what story does it tell? Not the job titles — the story underneath.',
        'What kind of problems do you solve better than almost anyone you know? Give me an example.',
      ];

      state.career_story_questions = questions;

      const fallbackContent = `## Why Me — My Career Story

*To create a truly compelling career story, I need to reflect on a few key questions. The answers will help me articulate not just what I have done, but who I am — the identity that makes me memorable in an interview.*

### Discovery Questions

${questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}

### Next Step

After answering these questions, I can use the Story Builder to craft a narrative identity — a 90-120 second story that communicates who I am at my core, backed by specific examples from my career. This story is what will make me stand out from every other qualified candidate.`;

      if (!state.sections) {
        state.sections = {} as InterviewPrepState['sections'];
      }
      state.sections.why_me = {
        section: 'why_me',
        content: fallbackContent,
        reviewed: true,
        review_notes: 'Insufficient resume detail — discovery questions generated',
        word_count: wordCount(fallbackContent),
      };

      ctx.emit({ type: 'section_progress', section: 'why_me', status: 'complete' });

      return JSON.stringify({
        success: true,
        action: 'discovery_questions',
        questions_count: questions.length,
        reason: 'Resume lacks sufficient detail for a compelling career story',
      });
    }

    // Build the career story
    const contextBlock = buildContextBlock(state);

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 4096,
      system: `You are a career storytelling expert helping a senior executive craft their interview identity narrative.

${INTERVIEW_PREP_RULES}

Focus specifically on Rule 6 — Career Story Identity. This is the MOST IMPORTANT section of the entire document.

Candidate/Company/Role data:
${contextBlock}`,
      messages: [{
        role: 'user',
        content: `Write the "Why Me — My Career Story" section.

1. Analyze the work history and achievements to find a PATTERN — what does this person consistently do across roles?
2. Name the pattern as an identity archetype (builder, fixer, translator, connector, steady hand, catalyst, etc.)
3. Write a 200-400 word first-person narrative story proving this identity with 2-3 specific examples
4. Connect the identity to what ${jdAnalysis?.company_name ?? 'the company'} needs for the ${jdAnalysis?.role_title ?? 'role'}
5. The tone must be authentic, confident, and human — not corporate

Write it as a story the candidate could tell in 90-120 seconds. Start with "## Why Me — My Career Story" as the header.`,
      }],
    });

    const content = response.text;

    if (!state.sections) {
      state.sections = {} as InterviewPrepState['sections'];
    }
    state.sections.why_me = {
      section: 'why_me',
      content,
      reviewed: false,
      word_count: wordCount(content),
    };

    ctx.emit({ type: 'section_progress', section: 'why_me', status: 'complete' });

    return JSON.stringify({
      success: true,
      action: 'story_written',
      word_count: wordCount(content),
    });
  },
};

// ─── Tool: assemble_report ──────────────────────────────────────────

const assembleReportTool: InterviewPrepTool = {
  name: 'assemble_report',
  description:
    'Assemble all written sections into the final interview preparation report. ' +
    'Call this after all 9 sections have been written and reviewed. ' +
    'Combines sections in document order and adds the closing offer (Rule 10).',
  model_tier: 'light',
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

    // Import section order
    const { SECTION_ORDER } = await import('../types.js');

    // Assemble in document order
    const parts: string[] = [];

    // Report header
    const candidateName = state.resume_data?.name ?? 'Candidate';
    const companyName = state.jd_analysis?.company_name ?? 'Target Company';
    const roleTitle = state.jd_analysis?.role_title ?? 'Target Role';

    parts.push(`# Comprehensive Interview Preparation Report`);
    parts.push('');
    parts.push(`**Candidate:** ${candidateName}`);
    parts.push(`**Target Role:** ${roleTitle}`);
    parts.push(`**Company:** ${companyName}`);
    parts.push('');
    parts.push('---');
    parts.push('');

    // Add each section
    let totalWords = 0;
    let sectionsIncluded = 0;
    const missingSections: string[] = [];

    for (const sectionKey of SECTION_ORDER) {
      const written = sections[sectionKey];
      if (written?.content) {
        parts.push(written.content);
        parts.push('');
        parts.push('---');
        parts.push('');
        totalWords += written.word_count;
        sectionsIncluded++;
      } else {
        missingSections.push(sectionKey);
      }
    }

    // Add closing offer (Rule 10)
    parts.push('## Next Steps');
    parts.push('');
    parts.push('I can help you go deeper on any part of this preparation:');
    parts.push('');
    parts.push('1. **Quick Reference Cheat Sheet** — A condensed 2-page version for final review before the interview.');
    parts.push('2. **Deep Dive** — More STAR stories, deeper company research, or additional technical questions for any section.');
    parts.push('3. **Mock Interview** — A simulated interview where I play the hiring manager and evaluate your responses in real time.');
    parts.push('4. **Different Role Prep** — A customized version of this report for a different position or company.');
    parts.push('5. **Story Builder Session** — A guided Q&A to help you craft or refine your career identity story.');

    const finalReport = parts.join('\n');

    // Calculate quality score
    const reviewedSections = SECTION_ORDER.filter(s => sections[s]?.reviewed).length;
    const qualityScore = Math.round((reviewedSections / SECTION_ORDER.length) * 100);

    state.final_report = finalReport;
    state.quality_score = qualityScore;

    return JSON.stringify({
      success: true,
      total_words: totalWords,
      sections_included: sectionsIncluded,
      missing_sections: missingSections,
      quality_score: qualityScore,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const writerTools: InterviewPrepTool[] = [
  writeSectionTool,
  selfReviewSectionTool,
  buildCareerStoryTool,
  assembleReportTool,
];
