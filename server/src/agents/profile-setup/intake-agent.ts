/**
 * Profile Setup — Intake Agent
 *
 * Single-prompt agent. Reads all 4 input fields (resume, linkedin about, target
 * roles, current situation) and produces an IntakeAnalysis that includes a
 * first-draft Why Me story and 8 targeted interview questions.
 *
 * One LLM call. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { ProfileSetupInput, IntakeAnalysis, StructuredExperience } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ intake agent. You have just received this person's resume, LinkedIn about section, target roles, and current situation. Your job is to do two things before the interview begins.

ONE — Produce a first-draft Why Me story.

Read everything they have given you. Find the thread that runs through their career — the capability that shows up again and again even when the job titles change, even when the industry shifts. That thread is the core of the Why Me story.

Write a first draft. Three to four sentences. It should sound like a person speaking, not a resume. It should name something specific — a company they transformed, a capability they built from nothing, a moment they navigated that most people have never faced. It should end with a clear answer to the question: why this person, for this kind of role, now.

FORBIDDEN PHRASES — never use these:
- "results-driven"
- "leveraged"
- "spearheaded"
- "aligns with"
- "strong candidate"
- "unique combination"
- "proven track record"
- "extensive experience"
- "passionate about"
- "dynamic professional"
- any phrase that sounds like it was written by a job posting generator

The first sentence is the most important. It must pass the 3-to-5 second test — a hiring manager glancing at this sentence alone should immediately know what makes this person different. Lead with the strongest, most specific claim you can make from the documents.

The why_me_draft is a first draft. It will be refined after the interview. Aim for honest and specific over polished.

TWO — Generate eight targeted interview questions.

These eight questions are the interview you are about to conduct. They should surface what the documents cannot capture.

The eight questions must cover these areas:
1. SCALE AND SCOPE — What is the largest thing this person has owned or led? Get a number, a budget, a team size, a revenue figure — something concrete.
2. DEFINING MOMENT — What is the hardest professional situation they have navigated? Not a challenge they overcame — a situation where the outcome was genuinely uncertain.
3. HIDDEN ACCOMPLISHMENT — What did they build or fix that never made it onto the resume? Most executives have at least one thing they are proud of that nobody knows about.
4. WHY THIS ROLE — What specifically draws them to this type of work now? This is not a softball question. The answer should reveal something about their positioning, not their enthusiasm.
5. THE THREAD — What do their colleagues consistently come to them for that has nothing to do with their job title?
6. THE DIFFERENTIATOR — What would their best reference say about them that would surprise a hiring manager?
7. HONEST CONCERN — What is the one thing about their background that they think will be the hardest to explain to a hiring manager?
8. TARGET ROLE SPECIFICS — Based on their stated target roles, ask one question that forces them to explain why they are the right person for that specific type of role, not just any role.

SOURCE DISCIPLINE: Every question must be grounded in what you actually read. Reference specific companies, roles, timeframes, or achievements from the resume or LinkedIn. Do not write generic questions. Do not write questions you could ask anyone.

SUGGESTED STARTERS: For each question, provide 2-3 short suggested starting points that help the candidate begin their answer. These are clickable chips shown below the question to reduce blank-page paralysis. Each starter should be a short phrase (3-8 words) that names a specific project, moment, or role from the resume that is relevant to the question. Always include "Something else" as the last option. Example starters for a migration question: ["The billing platform migration", "The Kubernetes rollout", "Something else"].

THREE — Extract structured experience entries.

Parse the resume into structured experience entries. For each role the candidate held, extract:
- company: the company or organization name
- title: the job title
- start_date: when they started (preserve the format from the resume)
- end_date: when they ended or "Present"
- location: city/state if mentioned, empty string if not
- scope_statement: one sentence summarizing the scope of this role — team size, budget, revenue responsibility, number of direct reports, systems owned, or geographic reach. Pull the most quantified details from the bullets. If no scope data is available, use an empty string.
- original_bullets: the bullet points listed under that role, as an array of strings

Extract ALL roles from the resume, in chronological order (most recent first).

Also include education entries — use "Education" as the company, the degree (e.g. "B.S. Computer Science") as the title, the institution name (e.g. "Oregon State University") in the location field, and leave original_bullets as an empty array. Do NOT include certifications or skills sections as experience entries.

OUTPUT FORMAT: Return valid JSON:
{
  "why_me_draft": "three to four sentences, conversational, specific",
  "career_thread": "one sentence naming the defining capability that runs through this career",
  "top_capabilities": [
    {
      "capability": "name of the capability",
      "evidence": "specific evidence from the resume or linkedin that proves this"
    }
  ],
  "profile_gaps": ["what is still unknown after reading the documents that would strengthen the profile"],
  "primary_concern": "the one thing about this background that hiring managers will push back on, or null if none",
  "interview_questions": [
    {
      "question": "the actual question to ask",
      "what_we_are_looking_for": "internal — what gap or proof point this question surfaces",
      "references_resume_element": "the specific resume or linkedin element this question is grounded in, or null",
      "suggested_starters": ["specific project or moment from resume", "another relevant option", "Something else"]
    }
  ],
  "structured_experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "2020",
      "end_date": "Present",
      "location": "City, ST",
      "scope_statement": "Led a 14-person team managing $4.2M annual budget across hybrid cloud environments",
      "original_bullets": ["bullet 1", "bullet 2"]
    }
  ]
}

Produce exactly 8 interview questions. Produce 3-5 top_capabilities. Produce 2-4 profile_gaps.

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary or text outside the JSON object.`;

function buildUserMessage(input: ProfileSetupInput): string {
  const parts: string[] = [
    '## Resume',
    input.resume_text,
    '',
    '## LinkedIn About',
    input.linkedin_about || '(not provided)',
    '',
    '## Target Roles',
    input.target_roles,
    '',
    '## Current Situation',
    input.situation || '(not provided)',
    '',
    'Read everything above. Produce the IntakeAnalysis. Return compact JSON only.',
  ];

  return parts.join('\n');
}

function buildDeterministicFallback(input: ProfileSetupInput): IntakeAnalysis {
  // Extract basic career themes from resume keywords
  const resumeLower = input.resume_text.toLowerCase();
  const themes: string[] = [];
  if (resumeLower.includes('manag') || resumeLower.includes('lead')) themes.push('leadership');
  if (resumeLower.includes('strateg')) themes.push('strategy');
  if (resumeLower.includes('operat')) themes.push('operations');
  if (resumeLower.includes('technolog') || resumeLower.includes('engineer')) themes.push('technology');
  if (resumeLower.includes('financ') || resumeLower.includes('revenue')) themes.push('finance');
  if (themes.length === 0) themes.push('executive leadership');

  const topTheme = themes[0] ?? 'leadership';

  return {
    why_me_draft: `This candidate has built a career around ${topTheme}. The resume shows consistent progression and meaningful impact across roles. The interview will surface the specific stories that demonstrate why they are the right person for their target roles.`,
    career_thread: `Consistent ${topTheme} capability across their career`,
    top_capabilities: [
      {
        capability: topTheme.charAt(0).toUpperCase() + topTheme.slice(1),
        evidence: 'Demonstrated through career progression shown in resume',
      },
    ],
    profile_gaps: [
      'Specific budget or team size scope not yet confirmed',
      'Key metrics from most recent role not yet captured',
    ],
    primary_concern: null,
    interview_questions: [
      {
        question: 'What is the largest team or budget you have directly owned, and what made that scope manageable for you?',
        what_we_are_looking_for: 'Concrete scale and scope evidence',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'Walk me through the hardest professional situation you have navigated — one where the outcome was genuinely uncertain.',
        what_we_are_looking_for: 'Defining moment under pressure',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'What did you build or fix at one of your previous companies that you are proud of but that never made it onto your resume?',
        what_we_are_looking_for: 'Hidden accomplishments',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'What specifically draws you to your target roles now, beyond the natural next step in your career?',
        what_we_are_looking_for: 'Intentionality and positioning clarity',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'What do your colleagues consistently come to you for that has nothing to do with your job title?',
        what_we_are_looking_for: 'The thread that does not show up on a resume',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'What would your best reference say about you that would genuinely surprise a hiring manager who only read your resume?',
        what_we_are_looking_for: 'The differentiator',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'What is the one thing about your background that you think will be the hardest to explain in a hiring conversation?',
        what_we_are_looking_for: 'Honest self-assessment of the hardest gap',
        references_resume_element: null,
        suggested_starters: [],
      },
      {
        question: 'Given your target roles, why are you specifically the right person for that kind of work — not just experienced in it?',
        what_we_are_looking_for: 'Positioning confidence and specificity',
        references_resume_element: null,
        suggested_starters: [],
      },
    ],
    structured_experience: [],
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeIntakeAnalysis(raw: unknown, fallback: IntakeAnalysis): IntakeAnalysis {
  const r = raw as Record<string, unknown>;

  const topCapabilitiesRaw = Array.isArray(r.top_capabilities) ? r.top_capabilities : [];
  const top_capabilities = topCapabilitiesRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      capability: typeof c.capability === 'string' ? c.capability : '',
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
    }))
    .filter((c) => c.capability.length > 0);

  const profileGapsRaw = Array.isArray(r.profile_gaps) ? r.profile_gaps : [];
  const profile_gaps = profileGapsRaw
    .filter((g): g is string => typeof g === 'string' && g.length > 0);

  const questionsRaw = Array.isArray(r.interview_questions) ? r.interview_questions : [];
  const interview_questions = questionsRaw
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q) => ({
      question: typeof q.question === 'string' ? q.question : '',
      what_we_are_looking_for: typeof q.what_we_are_looking_for === 'string' ? q.what_we_are_looking_for : '',
      references_resume_element: typeof q.references_resume_element === 'string' ? q.references_resume_element : null,
      suggested_starters: Array.isArray(q.suggested_starters)
        ? q.suggested_starters.filter((s): s is string => typeof s === 'string' && s.length > 0)
        : [],
    }))
    .filter((q) => q.question.length > 0);

  const experienceRaw = Array.isArray(r.structured_experience) ? r.structured_experience : [];
  const structured_experience: StructuredExperience[] = experienceRaw
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
    .map((e) => ({
      company: typeof e.company === 'string' ? e.company : '',
      title: typeof e.title === 'string' ? e.title : '',
      start_date: typeof e.start_date === 'string' ? e.start_date : '',
      end_date: typeof e.end_date === 'string' ? e.end_date : '',
      location: typeof e.location === 'string' ? e.location : '',
      scope_statement: typeof e.scope_statement === 'string' ? e.scope_statement : '',
      original_bullets: Array.isArray(e.original_bullets)
        ? e.original_bullets.filter((b): b is string => typeof b === 'string')
        : [],
    }))
    .filter((e) => e.company.length > 0 && e.title.length > 0);

  if (structured_experience.length === 0) {
    logger.warn('Intake Agent: structured_experience is empty — no roles extracted from resume');
  }

  return {
    why_me_draft: typeof r.why_me_draft === 'string' && r.why_me_draft.length > 0
      ? r.why_me_draft
      : fallback.why_me_draft,
    career_thread: typeof r.career_thread === 'string' && r.career_thread.length > 0
      ? r.career_thread
      : fallback.career_thread,
    top_capabilities: top_capabilities.length > 0 ? top_capabilities : fallback.top_capabilities,
    profile_gaps: profile_gaps.length > 0 ? profile_gaps : fallback.profile_gaps,
    primary_concern: typeof r.primary_concern === 'string' ? r.primary_concern
      : (r.primary_concern === null ? null : fallback.primary_concern),
    interview_questions: interview_questions.length > 0 ? interview_questions : fallback.interview_questions,
    structured_experience,
  };
}

export async function runIntakeAgent(
  input: ProfileSetupInput,
  signal?: AbortSignal,
): Promise<IntakeAnalysis> {
  const userMessage = buildUserMessage(input);
  const fallback = buildDeterministicFallback(input);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<IntakeAnalysis>(response.text);
    if (parsed) return normalizeIntakeAnalysis(parsed, fallback);

    logger.warn(
      { sessionId: input.session_id, rawSnippet: response.text.substring(0, 500) },
      'Intake Agent: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Intake Agent: first attempt failed, using deterministic fallback',
    );
    return fallback;
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage + '\n\nReturn ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary.' }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const retryParsed = repairJSON<IntakeAnalysis>(retry.text);
    if (retryParsed) return normalizeIntakeAnalysis(retryParsed, fallback);

    logger.error(
      { sessionId: input.session_id, rawSnippet: retry.text.substring(0, 500) },
      'Intake Agent: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Intake Agent: retry failed, using deterministic fallback',
    );
  }

  return fallback;
}
