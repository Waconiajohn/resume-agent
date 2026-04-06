/**
 * Profile Setup — Synthesizer Agent
 *
 * Single-prompt agent. Reads all intake analysis + the full interview transcript
 * and produces a CareerIQProfileFull — the complete, polished profile.
 *
 * One LLM call. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { ProfileSetupInput, IntakeAnalysis, InterviewAnswer, CareerIQProfileFull } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ synthesis agent. The intake analysis and interview are complete. Now you must produce the finished profile.

Six components: CAREER THREAD, TOP CAPABILITIES, SIGNATURE STORY, HONEST ANSWER, RIGHTEOUS CLOSE, and WHY ME FINAL.

CAREER THREAD

One to two sentences. Names the defining capability that runs through this career. It must be grounded in specific evidence from the interview answers — not just the resume. If the interview revealed something the resume did not capture, the career thread should reflect the fuller picture.

TOP CAPABILITIES

Three to five capabilities. Each one must have:
- A name (short, non-resume-speak — not "stakeholder management" but "reading a room before it turns against you")
- Evidence from at least two sources: resume, LinkedIn, or interview answers
- A source field: 'resume', 'linkedin', 'interview', or 'all'

Prioritize capabilities that appeared in the interview answers. The interview is the most authentic source.

SIGNATURE STORY

The one story that, if told well, makes the hiring manager lean forward. It must come from the interview answers — specifically from the defining moment or hidden accomplishment responses. Structure it as STAR+R (Situation, Task, Action, Result, Reflection).

Each component is two to four sentences. The reflection is the most important — it should show what this person learned and why that insight matters for their next role.

HONEST ANSWER

Two fields:
- concern: the one objection a hiring manager will raise about this background
- response: the honest, factual response that neutralizes it without defensiveness

The response must not deny the concern. It must reframe it with evidence. If the interview addressed this directly, use that. If not, reason from what you know.

RIGHTEOUS CLOSE

One paragraph. Three to four sentences. This is the candidate's positioning statement — the paragraph they would use to open a networking conversation or close a cover letter. It must:
- Name the career thread
- Name one specific capability with one specific proof point
- State clearly what kind of role they are targeting and why
- Sound like a person, not a press release

FORBIDDEN PHRASES — none of these should appear anywhere in the output:
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
- "thought leader"
- any phrase that sounds like it was written by a job posting generator

WHY ME FINAL

WHY ME FINAL is not the same as the RIGHTEOUS CLOSE. RIGHTEOUS CLOSE is a full paragraph written in the candidate's voice for networking contexts. WHY ME FINAL is a two-part distillation: the headline is a single claim built for a hiring manager scanning a stack of resumes, and the body proves that claim. The headline should be shorter, sharper, and more specific than anything in the RIGHTEOUS CLOSE paragraph.

Two fields: headline and body.

HEADLINE: One sentence. This is the 3-to-5 second test. A hiring manager glances at this and immediately knows what makes this person different. It must:
- Open with the single most powerful, specific, defensible claim about this candidate
- Name a concrete achievement, capability, or combination that no other candidate in the pile can claim
- Be grounded in evidence from the interview or resume — not aspirational language
- Pass the uniqueness test: could another executive with a similar background claim this exact sentence? If yes, rewrite it.

Good example: "Sarah turned a 15-year-old monolith into 4 microservices with zero downtime while growing her team from 5 to 14 — and she's the person the VP of Product calls when a technical constraint needs to be explained in customer impact terms."

Bad example: "I'm the right fit because I bring a unique combination of technical expertise, leadership skills, and business acumen."

The headline is the single most important output of this entire profile. It will seed every professional summary this platform generates. Get it right.

BODY: Two to three sentences. These prove the headline. Each sentence must reference a specific moment, metric, or outcome from the interview answers or resume. The body answers "how do we know?" for whatever the headline claims.

OUTPUT FORMAT: Return valid JSON:
{
  "career_thread": "one to two sentences",
  "top_capabilities": [
    {
      "capability": "name",
      "evidence": "specific evidence from resume, linkedin, and/or interview",
      "source": "resume|linkedin|interview|all"
    }
  ],
  "signature_story": {
    "situation": "two to four sentences",
    "task": "two to four sentences",
    "action": "two to four sentences",
    "result": "two to four sentences",
    "reflection": "two to four sentences — the most important part"
  },
  "honest_answer": {
    "concern": "the objection",
    "response": "the factual reframe"
  },
  "righteous_close": "one paragraph",
  "why_me_final": {
    "headline": "one sentence — the hook",
    "body": "two to three sentences — the proof"
  },
  "target_roles": ["role 1", "role 2"],
  "created_at": "ISO 8601 timestamp"
}

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary or text outside the JSON object.`;

function buildUserMessage(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
  answers: InterviewAnswer[],
): string {
  const parts: string[] = [
    '## Original Input',
    '',
    '### Resume',
    input.resume_text,
    '',
    '### LinkedIn About',
    input.linkedin_about || '(not provided)',
    '',
    '### Target Roles',
    input.target_roles,
    '',
    '### Current Situation',
    input.situation || '(not provided)',
    '',
    '## Intake Analysis',
    '',
    `First-draft Why Me: ${intake.why_me_draft}`,
    `Career Thread: ${intake.career_thread}`,
    '',
    'Top Capabilities:',
    ...intake.top_capabilities.map((c) => `- ${c.capability}: ${c.evidence}`),
    '',
    'Profile Gaps Identified:',
    ...intake.profile_gaps.map((g) => `- ${g}`),
    intake.primary_concern ? `Primary Concern: ${intake.primary_concern}` : '',
    '',
    '## Interview Transcript',
    '',
  ];

  if (answers.length === 0) {
    parts.push('(No interview answers provided — synthesize from intake analysis only)');
  } else {
    for (const answer of answers) {
      parts.push(`Q${answer.question_index + 1}: ${answer.question}`);
      parts.push(`A: ${answer.answer}`);
      parts.push('');
    }
  }

  parts.push('Synthesize the complete CareerIQ profile from everything above. Return compact JSON only.');

  return parts.filter((p) => p !== undefined).join('\n');
}

function buildDeterministicFallback(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
): CareerIQProfileFull {
  const targetRolesArray = input.target_roles
    .split(/[,\n]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  return {
    career_thread: intake.career_thread,
    top_capabilities: intake.top_capabilities.map((c) => ({
      capability: c.capability,
      evidence: c.evidence,
      source: 'resume' as const,
    })),
    signature_story: {
      situation: 'The candidate has navigated significant professional challenges across their career.',
      task: 'In their most impactful role, they were responsible for meaningful organizational outcomes.',
      action: 'They applied their core capabilities to navigate the challenge with deliberate decisions.',
      result: 'The outcome demonstrated their ability to deliver results under pressure.',
      reflection: 'This experience sharpened their judgment in ways that directly apply to their target roles.',
    },
    honest_answer: {
      concern: intake.primary_concern ?? 'Career transition timeline may raise questions',
      response: 'The background, read carefully, shows consistent forward momentum and deliberate role choices.',
    },
    righteous_close: intake.why_me_draft,
    why_me_final: {
      headline: intake.why_me_draft,
      body: '',
    },
    target_roles: targetRolesArray,
    created_at: new Date().toISOString(),
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeCareerIQProfile(raw: unknown, fallback: CareerIQProfileFull): CareerIQProfileFull {
  const r = raw as Record<string, unknown>;

  const capabilitiesRaw = Array.isArray(r.top_capabilities) ? r.top_capabilities : [];
  const top_capabilities = capabilitiesRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      capability: typeof c.capability === 'string' ? c.capability : '',
      evidence: typeof c.evidence === 'string' ? c.evidence : '',
      source: (['resume', 'linkedin', 'interview', 'all'] as const).includes(c.source as 'resume' | 'linkedin' | 'interview' | 'all')
        ? (c.source as 'resume' | 'linkedin' | 'interview' | 'all')
        : 'resume' as const,
    }))
    .filter((c) => c.capability.length > 0);

  const storyRaw = r.signature_story && typeof r.signature_story === 'object' && !Array.isArray(r.signature_story)
    ? r.signature_story as Record<string, unknown>
    : {};

  const honestRaw = r.honest_answer && typeof r.honest_answer === 'object' && !Array.isArray(r.honest_answer)
    ? r.honest_answer as Record<string, unknown>
    : {};

  const targetRolesRaw = Array.isArray(r.target_roles) ? r.target_roles : [];
  const target_roles = targetRolesRaw
    .filter((role): role is string => typeof role === 'string' && role.length > 0);

  return {
    career_thread: typeof r.career_thread === 'string' && r.career_thread.length > 0
      ? r.career_thread
      : fallback.career_thread,
    top_capabilities: top_capabilities.length > 0 ? top_capabilities : fallback.top_capabilities,
    signature_story: {
      situation: typeof storyRaw.situation === 'string' && storyRaw.situation.length > 0
        ? storyRaw.situation
        : fallback.signature_story.situation,
      task: typeof storyRaw.task === 'string' && storyRaw.task.length > 0
        ? storyRaw.task
        : fallback.signature_story.task,
      action: typeof storyRaw.action === 'string' && storyRaw.action.length > 0
        ? storyRaw.action
        : fallback.signature_story.action,
      result: typeof storyRaw.result === 'string' && storyRaw.result.length > 0
        ? storyRaw.result
        : fallback.signature_story.result,
      reflection: typeof storyRaw.reflection === 'string' && storyRaw.reflection.length > 0
        ? storyRaw.reflection
        : fallback.signature_story.reflection,
    },
    honest_answer: {
      concern: typeof honestRaw.concern === 'string' && honestRaw.concern.length > 0
        ? honestRaw.concern
        : fallback.honest_answer.concern,
      response: typeof honestRaw.response === 'string' && honestRaw.response.length > 0
        ? honestRaw.response
        : fallback.honest_answer.response,
    },
    righteous_close: typeof r.righteous_close === 'string' && r.righteous_close.length > 0
      ? r.righteous_close
      : fallback.righteous_close,
    why_me_final: (() => {
      const whyMeRaw = r.why_me_final;
      if (whyMeRaw && typeof whyMeRaw === 'object' && !Array.isArray(whyMeRaw)) {
        const wm = whyMeRaw as Record<string, unknown>;
        return {
          headline: typeof wm.headline === 'string' && wm.headline.length > 0
            ? wm.headline : fallback.why_me_final.headline,
          body: typeof wm.body === 'string' && wm.body.length > 0
            ? wm.body : fallback.why_me_final.body,
        };
      } else if (typeof whyMeRaw === 'string' && whyMeRaw.length > 0) {
        // Legacy string — use as headline, empty body
        return { headline: whyMeRaw, body: '' };
      }
      return fallback.why_me_final;
    })(),
    target_roles: target_roles.length > 0 ? target_roles : fallback.target_roles,
    created_at: typeof r.created_at === 'string' && r.created_at.length > 0
      ? r.created_at
      : new Date().toISOString(),
  };
}

export async function synthesizeProfile(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
  answers: InterviewAnswer[],
  signal?: AbortSignal,
): Promise<CareerIQProfileFull> {
  const userMessage = buildUserMessage(input, intake, answers);
  const fallback = buildDeterministicFallback(input, intake);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<CareerIQProfileFull>(response.text);
    if (parsed) return normalizeCareerIQProfile(parsed, fallback);

    logger.warn(
      { sessionId: input.session_id, rawSnippet: response.text.substring(0, 500) },
      'Synthesizer: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Synthesizer: first attempt failed, using deterministic fallback',
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

    const retryParsed = repairJSON<CareerIQProfileFull>(retry.text);
    if (retryParsed) return normalizeCareerIQProfile(retryParsed, fallback);

    logger.error(
      { sessionId: input.session_id, rawSnippet: retry.text.substring(0, 500) },
      'Synthesizer: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { sessionId: input.session_id, error: error instanceof Error ? error.message : String(error) },
      'Synthesizer: retry failed, using deterministic fallback',
    );
  }

  return fallback;
}
