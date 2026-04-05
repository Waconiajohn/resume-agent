/**
 * Interview Prep Writer — Tool definitions.
 *
 * 7 tools:
 * - write_section: Write a single section of the interview prep report
 * - self_review_section: Quality check a written section against Rule 9
 * - build_career_story: Special handler for the Why Me section (Rule 6)
 * - assemble_report: Combine all sections into the final document
 * - generate_thank_you_notes: Personalized thank-you notes per interviewer
 * - generate_follow_up_email: Situation-specific follow-up email
 * - generate_interview_debrief: Structured debrief notes post-interview
 */

import type { AgentTool } from '../../runtime/agent-protocol.js';
import type {
  InterviewPrepState,
  InterviewPrepSSEEvent,
  InterviewPrepSection,
  InterviewStory,
  WrittenSection,
  ThankYouNoteOutput,
  FollowUpEmailOutput,
  FollowUpSituation,
  InterviewDebriefOutput,
} from '../types.js';
import { getUserContext, insertUserContext } from '../../../lib/platform-context.js';
import { INTERVIEW_PREP_RULES } from '../knowledge/rules.js';
import { llm, MODEL_PRIMARY, MODEL_MID } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import {
  renderWhyMeStorySection,
  renderCareerNarrativeSection,
} from '../../../contracts/shared-context-prompt.js';
import { hasMeaningfulSharedValue } from '../../../contracts/shared-context.js';

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
    if ((state.company_research.strategic_priorities?.length ?? 0) > 0) {
      parts.push('Strategic Priorities This Year:');
      for (const p of state.company_research.strategic_priorities!) parts.push(`- ${p}`);
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
    if ((state.company_research.culture_signals?.length ?? 0) > 0) {
      parts.push('Culture Signals:');
      for (const s of state.company_research.culture_signals!) parts.push(`- ${s}`);
    }
    if (state.company_research.role_impact) {
      parts.push(`Role Impact on Business: ${state.company_research.role_impact}`);
    }
  }

  if (state.sourced_questions && state.sourced_questions.length > 0) {
    parts.push('\n## Sourced Interview Questions');
    for (const q of state.sourced_questions) {
      parts.push(`- [${q.category}] ${q.question} (source: ${q.source})`);
    }
  }

  if (hasMeaningfulSharedValue(state.shared_context?.careerNarrative)) {
    parts.push(...renderCareerNarrativeSection({
      heading: '## Career Narrative Signals',
      sharedNarrative: state.shared_context?.careerNarrative,
    }));
  } else if (state.platform_context?.why_me_story) {
    parts.push(...renderWhyMeStorySection({
      heading: '## Why-Me Story (from CareerIQ)',
      legacyWhyMeStory: state.platform_context.why_me_story,
    }));
  }

  return parts.join('\n');
}

// Section-specific writing instructions
const SECTION_INSTRUCTIONS: Record<InterviewPrepSection, string> = {
  company_research: 'Write Section 1: Company Research. Use ALL research data provided. Include: Overview (what they do, how they make money), Strategic Priorities for this year (named programs — not generic observations), Growth Areas, Potential Risks to that growth, Competitors, Culture Signals, and how this specific role impacts their revenue or operations. Be specific — name actual products, services, numbers. No tables.',
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
    'and meet minimum length requirements. Call this for each required section, using the sequence that best fits the available evidence.',
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
    const sharedNarrative = state.shared_context?.careerNarrative;

    ctx.emit({ type: 'section_progress', section: 'why_me', status: 'writing' });

    // Check if we have enough resume detail for a story
    const hasWorkHistory = (resumeData?.work_history?.length ?? 0) >= 2;
    const hasAchievements = (resumeData?.key_achievements?.length ?? 0) >= 3;
    const hasSharedNarrative = hasMeaningfulSharedValue(sharedNarrative);
    const hasWhyMe = hasSharedNarrative || !!(whyMe?.colleaguesCameForWhat || whyMe?.knownForWhat);
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

// ─── Tool: generate_thank_you_notes ─────────────────────────────────

const generateThankYouNotesTool: InterviewPrepTool = {
  name: 'generate_thank_you_notes',
  description:
    'Generate personalized thank-you notes for each interviewer after the interview. ' +
    'Each note is grounded in what was actually discussed, tailored to the interviewer\'s role and seniority, ' +
    'and reinforces candidacy without desperation. ' +
    'Use this after the interview has taken place — call with the names, roles, and discussion points for each interviewer.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      interviewers: {
        type: 'array',
        description: 'List of interviewers to write notes for',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Interviewer full name' },
            title: { type: 'string', description: 'Interviewer job title' },
            topics_discussed: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key topics or themes covered in this conversation',
            },
            shared_context: {
              type: 'string',
              description: 'Any personal rapport, shared interests, or memorable moments from the conversation',
            },
          },
          required: ['name'],
        },
      },
      interview_date: {
        type: 'string',
        description: 'Date of the interview (YYYY-MM-DD or natural language)',
      },
    },
    required: ['interviewers'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const interviewers = Array.isArray(input.interviewers)
      ? (input.interviewers as Array<{
          name: string;
          title?: string;
          topics_discussed?: string[];
          shared_context?: string;
        }>)
      : [];

    if (interviewers.length === 0) {
      return JSON.stringify({ success: false, error: 'No interviewers provided.' });
    }

    const company = state.jd_analysis?.company_name ?? 'the company';
    const role = state.jd_analysis?.role_title ?? 'the role';
    const candidateName = state.resume_data?.name ?? 'the candidate';
    const interviewDate = String(input.interview_date ?? 'recent');

    // Build context block for personalization
    const contextLines: string[] = [];
    if (state.resume_data) {
      contextLines.push(`Candidate: ${candidateName}, ${state.resume_data.current_title}`);
      if (state.resume_data.key_achievements.length > 0) {
        contextLines.push(`Key Achievements: ${state.resume_data.key_achievements.slice(0, 10).join('; ')}`);
      }
    }
    const knownFor = state.shared_context?.careerNarrative?.leadershipIdentity
      ?? state.platform_context?.why_me_story?.knownForWhat;
    if (knownFor) {
      contextLines.push(`Known for: ${knownFor}`);
    }

    const interviewerBlock = interviewers.map((iv) => {
      const lines = [`- ${iv.name} (${iv.title ?? 'unknown title'})`];
      if (iv.topics_discussed && iv.topics_discussed.length > 0) {
        lines.push(`  Topics: ${iv.topics_discussed.join(', ')}`);
      }
      if (iv.shared_context) {
        lines.push(`  Shared context: ${iv.shared_context}`);
      }
      return lines.join('\n');
    }).join('\n');

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 6000,
      system: `You are a world-class executive communication writer. You write authentic, personalized thank-you notes for senior executives (45+) after job interviews.

Your notes build relationships and reinforce candidacy without desperation. Every note is peer-level — written as one executive to another.

Quality standards:
- Each note references at least one specific topic from the conversation (not generic)
- Tone matches interviewer seniority (C-suite gets more formal/strategic than peer-level)
- One brief, natural connection to the candidate's relevant value
- Forward-looking close that references next steps or continued conversation
- No cliches ("great opportunity", "perfect fit"), no salary mentions, no excessive flattery
- 150-250 words, 3-5 short paragraphs
- Subject line: compelling and specific, not "Thank you for your time"

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write personalized thank-you notes for each interviewer below.

Company: ${company}
Role: ${role}
Interview Date: ${interviewDate}
${contextLines.length > 0 ? `\nCandidate Context:\n${contextLines.join('\n')}` : ''}

Interviewers:
${interviewerBlock}

Return JSON:
{
  "notes": [
    {
      "interviewer": "name",
      "interviewer_title": "title or empty string if unknown",
      "note_text": "full email body",
      "subject_line": "email subject",
      "key_callbacks": ["specific topic 1", "specific topic 2"],
      "timing_guidance": "send within X hours because..."
    }
  ]
}`,
      }],
    });

    let parsed: { notes?: ThankYouNoteOutput[] };
    try {
      parsed = JSON.parse(repairJSON(response.text) ?? response.text) as { notes?: ThankYouNoteOutput[] };
    } catch {
      parsed = { notes: [] };
    }

    const notes: ThankYouNoteOutput[] = Array.isArray(parsed.notes)
      ? parsed.notes.map((n) => ({
          interviewer: String(n.interviewer ?? ''),
          interviewer_title: String(n.interviewer_title ?? ''),
          note_text: String(n.note_text ?? ''),
          subject_line: String(n.subject_line ?? ''),
          key_callbacks: Array.isArray(n.key_callbacks) ? n.key_callbacks.map(String) : [],
          timing_guidance: String(n.timing_guidance ?? 'Send within 2-4 hours of the interview.'),
        }))
      : [];

    if (!state.post_interview_docs) {
      state.post_interview_docs = {};
    }
    state.post_interview_docs.thank_you_notes = notes;

    return JSON.stringify({
      success: true,
      note_count: notes.length,
      interviewers_covered: notes.map((n) => n.interviewer),
    });
  },
};

// ─── Tool: generate_follow_up_email ─────────────────────────────────

const FOLLOW_UP_SITUATION_DESCRIPTIONS: Record<FollowUpSituation, string> = {
  post_interview: 'Standard follow-up sent 5-7 business days after the interview to check on status',
  no_response: 'Follow-up when the company has gone silent for 2+ weeks after a promised decision',
  rejection_graceful: 'Graceful response to a rejection that keeps the door open and builds long-term relationship',
  keep_warm: 'Check-in note for a role that stalled or a contact worth maintaining for future opportunities',
  negotiation_counter: 'Acknowledgment + counter-proposal framing for a compensation or offer negotiation',
};

const generateFollowUpEmailTool: InterviewPrepTool = {
  name: 'generate_follow_up_email',
  description:
    'Generate a follow-up email for post-interview situations: checking on status, handling no-response, ' +
    'responding gracefully to rejection, keeping a warm contact, or framing a negotiation counter. ' +
    'Each email is personalized to the company, role, and candidate context.',
  model_tier: 'primary',
  input_schema: {
    type: 'object',
    properties: {
      situation: {
        type: 'string',
        enum: ['post_interview', 'no_response', 'rejection_graceful', 'keep_warm', 'negotiation_counter'],
        description: 'The post-interview situation this email addresses',
      },
      recipient_name: {
        type: 'string',
        description: 'Name of the primary recipient (hiring manager, recruiter, or HR contact)',
      },
      recipient_title: {
        type: 'string',
        description: 'Title of the recipient (helps calibrate tone)',
      },
      specific_context: {
        type: 'string',
        description: 'Any specific context for this situation — e.g. what offer was made for negotiation, what went well for rejection response, what was the last contact date',
      },
    },
    required: ['situation'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const situation = String(input.situation ?? 'post_interview') as FollowUpSituation;
    const recipientName = input.recipient_name ? String(input.recipient_name) : undefined;
    const recipientTitle = input.recipient_title ? String(input.recipient_title) : undefined;
    const specificContext = input.specific_context ? String(input.specific_context) : undefined;

    const company = state.jd_analysis?.company_name ?? 'the company';
    const role = state.jd_analysis?.role_title ?? 'the role';
    const candidateName = state.resume_data?.name ?? 'the candidate';
    const situationDescription = FOLLOW_UP_SITUATION_DESCRIPTIONS[situation];

    const recipientLine = recipientName
      ? `Recipient: ${recipientName}${recipientTitle ? `, ${recipientTitle}` : ''}`
      : 'Recipient: not specified — write to hiring manager';

    const candidateStrengths = state.resume_data?.key_achievements?.slice(0, 8).join('; ') ?? '';

    const response = await llm.chat({
      model: MODEL_PRIMARY,
      max_tokens: 3000,
      system: `You are an executive communication strategist. You write precise, confident follow-up emails for senior executives in job search situations.

These emails are for executives (45+) who are peer-level to the people they are writing to. The tone is always professional, confident, and forward-looking — never desperate, apologetic, or sycophantic.

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Write a follow-up email for this situation.

Situation: ${situation}
Description: ${situationDescription}

Context:
Company: ${company}
Role: ${role}
Candidate: ${candidateName}
${recipientLine}
${candidateStrengths ? `Candidate's key strengths: ${candidateStrengths}` : ''}
${specificContext ? `\nSpecific context for this email:\n${specificContext}` : ''}

Requirements by situation:
- post_interview: Friendly check-in on timeline, brief reiteration of fit, forward-looking
- no_response: Polite persistence without desperation, gives them an easy out, leaves door open
- rejection_graceful: Genuine appreciation + one authentic sentence on what they learned, explicit invitation to stay in touch
- keep_warm: Brief, genuine, adds value (article/insight/update), asks nothing
- negotiation_counter: Acknowledges the offer positively, frames the counter as collaborative problem-solving, specific numbers or terms if provided

Return JSON:
{
  "situation": "${situation}",
  "subject": "email subject line",
  "body": "full email body",
  "tone_notes": "why you made these tone choices",
  "timing_guidance": "when to send this and any send tips"
}`,
      }],
    });

    let parsed: Partial<FollowUpEmailOutput>;
    try {
      parsed = JSON.parse(repairJSON(response.text) ?? response.text) as Partial<FollowUpEmailOutput>;
    } catch {
      parsed = {};
    }

    const email: FollowUpEmailOutput = {
      situation,
      subject: String(parsed.subject ?? `Re: ${role} at ${company}`),
      body: String(parsed.body ?? response.text.trim()),
      tone_notes: String(parsed.tone_notes ?? ''),
      timing_guidance: String(parsed.timing_guidance ?? ''),
    };

    if (!state.post_interview_docs) {
      state.post_interview_docs = {};
    }
    state.post_interview_docs.follow_up_email = email;

    return JSON.stringify({
      success: true,
      situation,
      subject: email.subject,
      word_count: email.body.split(/\s+/).filter(Boolean).length,
    });
  },
};

// ─── Tool: generate_interview_debrief ───────────────────────────────

const generateInterviewDebriefTool: InterviewPrepTool = {
  name: 'generate_interview_debrief',
  description:
    'Generate structured debrief notes immediately after an interview. ' +
    'Captures what went well, what could be stronger, follow-up actions, and lessons for next time. ' +
    'Use this to help the candidate process and learn from the interview while it is still fresh.',
  model_tier: 'mid',
  input_schema: {
    type: 'object',
    properties: {
      what_went_well: {
        type: 'string',
        description: 'What the candidate felt went well — specific moments, answers, or interactions',
      },
      what_was_difficult: {
        type: 'string',
        description: 'Questions or moments that felt uncertain, weak, or where answers were vague',
      },
      questions_asked: {
        type: 'array',
        items: { type: 'string' },
        description: 'Questions the interviewers asked (as many as the candidate can remember)',
      },
      interviewers_met: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names or roles of who the candidate met with',
      },
      company_signals: {
        type: 'string',
        description: 'Anything the candidate observed about the company culture, team dynamic, or role reality',
      },
      overall_impression: {
        type: 'string',
        enum: ['positive', 'neutral', 'negative'],
        description: 'Candidate\'s overall read on how the interview went',
      },
    },
    required: [],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const company = state.jd_analysis?.company_name ?? 'the company';
    const role = state.jd_analysis?.role_title ?? 'the role';

    const whatWentWell = input.what_went_well ? String(input.what_went_well) : '';
    const whatWasDifficult = input.what_was_difficult ? String(input.what_was_difficult) : '';
    const questionsAsked = Array.isArray(input.questions_asked)
      ? (input.questions_asked as string[]).map(String)
      : [];
    const interviewersMet = Array.isArray(input.interviewers_met)
      ? (input.interviewers_met as string[]).map(String)
      : [];
    const companySignals = input.company_signals ? String(input.company_signals) : '';
    const overallImpression = (input.overall_impression as 'positive' | 'neutral' | 'negative' | undefined) ?? 'neutral';

    const candidateContext: string[] = [];
    if (state.resume_data) {
      candidateContext.push(`Candidate: ${state.resume_data.name}, ${state.resume_data.current_title}`);
    }
    if (state.jd_analysis?.requirements && state.jd_analysis.requirements.length > 0) {
      candidateContext.push(`Top requirements for this role: ${state.jd_analysis.requirements.slice(0, 3).map((r) => r.requirement).join('; ')}`);
    }

    const response = await llm.chat({
      model: MODEL_MID,
      max_tokens: 3000,
      system: `You are an executive interview coach helping a senior candidate debrief immediately after an interview.

Your job is to:
1. Synthesize what the candidate shared into structured, actionable insights
2. Identify specific strengths they demonstrated (not generic praise)
3. Give honest, constructive feedback on areas to strengthen
4. Create concrete follow-up actions and lessons for next time
5. Keep company signals honest — both positive and concerning signals are valuable

Be specific and honest. The candidate is a senior executive — they can handle direct feedback.

Return ONLY valid JSON.`,
      messages: [{
        role: 'user',
        content: `Help debrief this interview.

Company: ${company}
Role: ${role}
${candidateContext.length > 0 ? `\n${candidateContext.join('\n')}` : ''}
${interviewersMet.length > 0 ? `\nInterviewers met: ${interviewersMet.join(', ')}` : ''}
${questionsAsked.length > 0 ? `\nQuestions asked:\n${questionsAsked.map((q) => `- ${q}`).join('\n')}` : ''}
${whatWentWell ? `\nWhat went well:\n${whatWentWell}` : ''}
${whatWasDifficult ? `\nWhat was difficult:\n${whatWasDifficult}` : ''}
${companySignals ? `\nCompany signals observed:\n${companySignals}` : ''}
Overall impression: ${overallImpression}

Return JSON:
{
  "company": "${company}",
  "role": "${role}",
  "strengths_demonstrated": ["specific strength 1", "specific strength 2"],
  "areas_to_improve": ["specific area 1", "specific area 2"],
  "follow_up_items": ["concrete action 1", "concrete action 2"],
  "lessons_for_next": ["lesson 1", "lesson 2"],
  "overall_impression": "${overallImpression}",
  "company_signals": ["signal 1", "signal 2"]
}`,
      }],
    });

    let parsed: Partial<InterviewDebriefOutput>;
    try {
      parsed = JSON.parse(repairJSON(response.text) ?? response.text) as Partial<InterviewDebriefOutput>;
    } catch {
      parsed = {};
    }

    const debrief: InterviewDebriefOutput = {
      company: String(parsed.company ?? company),
      role: String(parsed.role ?? role),
      strengths_demonstrated: Array.isArray(parsed.strengths_demonstrated)
        ? parsed.strengths_demonstrated.map(String)
        : [],
      areas_to_improve: Array.isArray(parsed.areas_to_improve)
        ? parsed.areas_to_improve.map(String)
        : [],
      follow_up_items: Array.isArray(parsed.follow_up_items)
        ? parsed.follow_up_items.map(String)
        : [],
      lessons_for_next: Array.isArray(parsed.lessons_for_next)
        ? parsed.lessons_for_next.map(String)
        : [],
      overall_impression: overallImpression,
      company_signals: Array.isArray(parsed.company_signals)
        ? parsed.company_signals.map(String)
        : [],
    };

    if (!state.post_interview_docs) {
      state.post_interview_docs = {};
    }
    state.post_interview_docs.debrief = debrief;

    return JSON.stringify({
      success: true,
      strengths_count: debrief.strengths_demonstrated.length,
      areas_count: debrief.areas_to_improve.length,
      follow_up_count: debrief.follow_up_items.length,
      overall_impression: debrief.overall_impression,
    });
  },
};

// ─── Tool: recall_story_bank ────────────────────────────────────────

const recallStoryBankTool: InterviewPrepTool = {
  name: 'recall_story_bank',
  description:
    "Load all existing STAR+R stories from the user's Story Bank. " +
    'Call this at the beginning of every interview prep session to review existing stories ' +
    'before generating new ones. Returns an array of InterviewStory objects.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async execute(_input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;

    if (!userId) {
      return JSON.stringify({ success: false, error: 'No user_id available' });
    }

    const rows = await getUserContext(userId, 'interview_story');
    const stories = rows
      .map((row) => {
        const c = row.content as Record<string, unknown>;
        return {
          situation: typeof c.situation === 'string' ? c.situation : '',
          task: typeof c.task === 'string' ? c.task : '',
          action: typeof c.action === 'string' ? c.action : '',
          result: typeof c.result === 'string' ? c.result : '',
          reflection: typeof c.reflection === 'string' ? c.reflection : '',
          themes: Array.isArray(c.themes) ? c.themes.filter((t): t is string => typeof t === 'string') : [],
          objections_addressed: Array.isArray(c.objections_addressed) ? c.objections_addressed.filter((t): t is string => typeof t === 'string') : [],
          source_job_id: typeof c.source_job_id === 'string' ? c.source_job_id : null,
          generated_at: typeof c.generated_at === 'string' ? c.generated_at : '',
          used_count: typeof c.used_count === 'number' ? c.used_count : 0,
        } satisfies InterviewStory;
      })
      .filter((s) => s.situation.length > 0 || s.action.length > 0)
      .slice(0, 30);

    ctx.scratchpad.existing_stories = stories;

    return JSON.stringify({
      success: true,
      story_count: stories.length,
      stories: stories.map((s, i) => ({
        index: i,
        themes: s.themes,
        objections_addressed: s.objections_addressed,
        situation_preview: s.situation.slice(0, 100),
        reflection_preview: s.reflection.slice(0, 100),
        used_count: s.used_count,
        source_job_id: s.source_job_id,
      })),
    });
  },
};

// ─── Tool: save_story ───────────────────────────────────────────────

const saveStoryTool: InterviewPrepTool = {
  name: 'save_story',
  description:
    "Save a complete STAR+R story to the user's Story Bank. " +
    'Every field including Reflection is mandatory. ' +
    'Call this for each new story generated during the session.',
  model_tier: 'light',
  input_schema: {
    type: 'object',
    properties: {
      situation: { type: 'string', description: 'The Situation — context and background' },
      task: { type: 'string', description: 'The Task — what needed to be accomplished' },
      action: { type: 'string', description: 'The Action — what the candidate specifically did' },
      result: { type: 'string', description: 'The Result — measurable outcomes' },
      reflection: {
        type: 'string',
        description: 'The Reflection — what was learned, what would be done differently. MANDATORY.',
      },
      themes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Thematic tags (e.g., leadership, crisis-management, scale, turnaround)',
      },
      objections_addressed: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Which hiring manager objections this story neutralizes ' +
          '(e.g., "employment gap concern", "age adaptability concern")',
      },
    },
    required: ['situation', 'task', 'action', 'result', 'reflection', 'themes'],
  },
  async execute(input, ctx) {
    const state = ctx.getState();
    const userId = state.user_id;

    if (!userId) {
      return JSON.stringify({ success: false, error: 'No user_id available' });
    }

    const reflection = input.reflection ? String(input.reflection) : '';
    if (!reflection || reflection.trim().length === 0) {
      return JSON.stringify({ success: false, error: 'Reflection field is mandatory and cannot be empty' });
    }

    const story: InterviewStory = {
      situation: String(input.situation ?? ''),
      task: String(input.task ?? ''),
      action: String(input.action ?? ''),
      result: String(input.result ?? ''),
      reflection,
      themes: Array.isArray(input.themes) ? (input.themes as string[]).map(String) : [],
      objections_addressed: Array.isArray(input.objections_addressed)
        ? (input.objections_addressed as string[]).map(String)
        : [],
      source_job_id: state.job_application_id ?? state.session_id ?? null,
      generated_at: new Date().toISOString(),
      used_count: 0,
    };

    await insertUserContext(
      userId,
      'interview_story',
      story as unknown as Record<string, unknown>,
      'interview-prep',
      state.session_id,
    );

    // Track in scratchpad
    const saved = (ctx.scratchpad.saved_stories as InterviewStory[] | undefined) ?? [];
    saved.push(story);
    ctx.scratchpad.saved_stories = saved;

    return JSON.stringify({
      success: true,
      message: `Story saved with themes: ${story.themes.join(', ')}`,
      total_saved_this_session: saved.length,
    });
  },
};

// ─── Exports ────────────────────────────────────────────────────────

export const writerTools: InterviewPrepTool[] = [
  writeSectionTool,
  selfReviewSectionTool,
  buildCareerStoryTool,
  assembleReportTool,
  generateThankYouNotesTool,
  generateFollowUpEmailTool,
  generateInterviewDebriefTool,
  recallStoryBankTool,
  saveStoryTool,
];
