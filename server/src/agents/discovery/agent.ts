/**
 * Discovery Agent
 *
 * The "Moment of Recognition" single-prompt agent. Takes the outputs from
 * job intelligence, candidate intelligence, and benchmark candidate, and
 * produces the recognition statement + excavation questions.
 *
 * One LLM call. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { CandidateIntelligenceOutput, BenchmarkCandidateOutput, JobIntelligenceOutput } from '../resume-v2/types.js';
import type { DiscoveryOutput } from './types.js';

const SYSTEM_PROMPT = `You are the voice of CareerIQ. You have just read this person's entire career history and analyzed the job they want. Now you must speak first.

Your job is not to ask questions. It is to make observations. To show this person that something intelligent has read their career and understood it better than they expected software could.

You must produce four things:

## 1. THE RECOGNITION STATEMENT

Three paragraphs of flowing prose. Not bullet points. Not templates with blanks. Real synthesis.

FIRST PARAGRAPH — THE CAREER THREAD:
Find the thing that appears across this person's entire career. The capability or drive that shows up in 2003 and again in 2011 and again in 2019 even though the industries were different and the titles were different. Name it with specificity. Not "leadership" — that is meaningless. What KIND of leadership? What do they build? What do they fix? What do they make possible that was not possible before them?

Write this as something the person could say out loud without feeling like they are bragging, because it is provably true. Every claim must trace to their actual resume.

SECOND PARAGRAPH — THE ROLE FIT:
Why this specific person for this specific job. Not generic fit language. Use actual evidence from the resume and actual requirements from the JD. Name the specific experiences that map to specific requirements. Be confident. Do not hedge.

THIRD PARAGRAPH — THE DIFFERENTIATOR:
What this person brings that the next candidate almost certainly does not. This is the "almost arrogant but for the right reasons" paragraph. Not inflation — accurate representation backed by evidence. The unique combination of experiences, industries, or capabilities that makes this person genuinely rare for this role.

## 2. EXCAVATION QUESTIONS

Generate 4-6 questions that go sideways, not direct. Questions that reference specific things from the resume to show the AI is paying attention.

NOT: "What are you good at?"
YES: "You stayed at [Company] for eleven years — what kept you there?"

NOT: "Describe your biggest accomplishment"
YES: "What did you build at [Company] that your replacement still hasn't figured out how to replicate?"

Each question must reference a specific company, role, timeframe, or achievement from the resume. Each question targets a gap in what we know — something the resume implies but does not prove.

## 3. PROFILE GAPS

What is still unknown after reading the resume that would strengthen the positioning. Be specific. Not "more detail needed" but "the budget scope of the operations transformation at [Company] is unclear — was this a $5M or $50M operation?"

## 4. HIRING MANAGER CONCERNS

For displaced executives ages 45-65, name the specific fears a hiring manager would have when seeing THIS resume. Not generic concerns. Specific concerns triggered by specific things in this resume. Then provide a neutralization — not cheerleading, not denial, but a specific factual response.

OUTPUT FORMAT: Return valid JSON:
{
  "recognition": {
    "career_thread": "paragraph 1 — the thread",
    "role_fit": "paragraph 2 — the fit",
    "differentiator": "paragraph 3 — the differentiator"
  },
  "excavation_questions": [
    {
      "question": "the actual question to ask the user",
      "what_we_are_looking_for": "internal — what gap this fills",
      "resume_reference": "the specific resume element referenced"
    }
  ],
  "profile_gaps": ["specific gap descriptions"],
  "hiring_manager_concerns": [
    {
      "objection": "the specific concern",
      "neutralization_strategy": "the factual response"
    }
  ]
}

TONE: Almost arrogant but for the right reasons. Not bragging. Truth-telling backed by evidence. Every claim must trace to the resume. If it is not there, do not say it.

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Use double-quoted JSON keys and string values.
- Do not wrap the JSON in markdown fences.
- Do not add commentary or text outside the JSON object.`;

function buildUserMessage(input: {
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
}): string {
  const { candidate, job_intelligence, benchmark } = input;

  const parts: string[] = [
    '## Candidate Profile',
    `Name: ${candidate.contact.name}`,
    `Career span: ${candidate.career_span_years} years`,
    `Career themes: ${candidate.career_themes.join(', ')}`,
    `Leadership scope: ${candidate.leadership_scope}`,
    `Operational scale: ${candidate.operational_scale}`,
    `Industries: ${candidate.industry_depth.join(', ')}`,
    '',
    'Experience:',
    ...candidate.experience.map(
      (e) => `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date})\n  ${e.bullets.slice(0, 3).join('\n  ')}`,
    ),
    '',
    'Quantified outcomes:',
    ...candidate.quantified_outcomes.slice(0, 8).map(
      (o) => `- [${o.metric_type}] ${o.outcome}: ${o.value}`,
    ),
    '',
    'Hidden accomplishments:',
    ...candidate.hidden_accomplishments.map((h) => `- ${h}`),
    '',
    '## Target Role',
    `${job_intelligence.role_title} at ${job_intelligence.company_name}`,
    `Industry: ${job_intelligence.industry}`,
    `Seniority: ${job_intelligence.seniority_level}`,
    '',
    'Core requirements:',
    ...job_intelligence.core_competencies.map(
      (c) => `- [${c.importance}] ${c.competency}: ${c.evidence_from_jd}`,
    ),
    '',
    'Business problems this hire solves:',
    ...job_intelligence.business_problems.map((p) => `- ${p}`),
    '',
    'Hidden hiring signals:',
    ...job_intelligence.hidden_hiring_signals.map((s) => `- ${s}`),
    '',
    '## Benchmark Assessment',
    `Role hypothesis: ${benchmark.role_problem_hypothesis}`,
    `Positioning frame: ${benchmark.positioning_frame}`,
    '',
    'Direct matches:',
    ...benchmark.direct_matches.map(
      (m) => `- [${m.strength}] ${m.jd_requirement}: ${m.candidate_evidence}`,
    ),
    '',
    'Gap assessment:',
    ...benchmark.gap_assessment.map(
      (g) => `- [${g.severity}] ${g.gap}: ${g.bridging_strategy}`,
    ),
    '',
    'Hiring manager objections:',
    ...benchmark.hiring_manager_objections.map(
      (o) => `- FEAR: ${o.objection} → RESPONSE: ${o.neutralization_strategy}`,
    ),
    '',
    'Now produce the recognition statement, excavation questions, profile gaps, and hiring manager concerns. Return compact JSON only.',
  ];

  return parts.join('\n');
}

function buildDeterministicFallback(input: {
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
}): DiscoveryOutput {
  const { candidate, job_intelligence, benchmark } = input;
  const topTheme = candidate.career_themes[0] ?? 'leadership';
  const topExperience = candidate.experience[0];
  const topOutcome = candidate.quantified_outcomes[0];

  return {
    recognition: {
      career_thread: `${candidate.contact.name}'s career shows a consistent thread of ${topTheme.toLowerCase()} across ${candidate.career_span_years} years. ${topExperience ? `From ${topExperience.title} at ${topExperience.company} onward, the pattern is clear.` : ''}`,
      role_fit: `The ${job_intelligence.role_title} role maps directly to the candidate's background. ${benchmark.direct_matches[0] ? `${benchmark.direct_matches[0].jd_requirement}: ${benchmark.direct_matches[0].candidate_evidence}` : 'Key requirements align with demonstrated experience.'}`,
      differentiator: benchmark.positioning_frame || `The combination of ${candidate.industry_depth.slice(0, 2).join(' and ')} depth with ${topTheme.toLowerCase()} makes this candidate distinctive.`,
    },
    excavation_questions: [
      {
        question: topExperience
          ? `What specifically drove the results you achieved at ${topExperience.company}?`
          : 'What accomplishment from your career are you most proud of, and why?',
        what_we_are_looking_for: 'Depth of contribution and decision-making authority',
        resume_reference: topExperience ? `${topExperience.title} at ${topExperience.company}` : undefined,
      },
      {
        question: topOutcome
          ? `The resume mentions ${topOutcome.outcome} — what were the specific decisions that made that possible?`
          : 'Walk me through the highest-stakes decision you made in the last five years.',
        what_we_are_looking_for: 'Decision-making process and ownership level',
        resume_reference: topOutcome ? topOutcome.outcome : undefined,
      },
    ],
    profile_gaps: benchmark.gap_assessment.slice(0, 3).map((g) => g.gap),
    hiring_manager_concerns: benchmark.hiring_manager_objections.slice(0, 3),
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

export async function runDiscoveryAgent(
  input: {
    candidate: CandidateIntelligenceOutput;
    job_intelligence: JobIntelligenceOutput;
    benchmark: BenchmarkCandidateOutput;
  },
  signal?: AbortSignal,
): Promise<DiscoveryOutput> {
  const userMessage = buildUserMessage(input);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const parsed = repairJSON<DiscoveryOutput>(response.text);
    if (parsed) return normalizeDiscoveryOutput(parsed, input);

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Discovery Agent: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Discovery Agent: first attempt failed, using deterministic fallback',
    );
    return buildDeterministicFallback(input);
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
      messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      signal,
    });

    const retryParsed = repairJSON<DiscoveryOutput>(retry.text);
    if (retryParsed) return normalizeDiscoveryOutput(retryParsed, input);

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Discovery Agent: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Discovery Agent: retry failed, using deterministic fallback',
    );
  }

  return buildDeterministicFallback(input);
}

function normalizeDiscoveryOutput(
  raw: DiscoveryOutput,
  input: {
    candidate: CandidateIntelligenceOutput;
    job_intelligence: JobIntelligenceOutput;
    benchmark: BenchmarkCandidateOutput;
  },
): DiscoveryOutput {
  const fallback = buildDeterministicFallback(input);
  const r = raw as unknown as Record<string, unknown>;

  const recognition = r.recognition && typeof r.recognition === 'object' && !Array.isArray(r.recognition)
    ? r.recognition as Record<string, unknown>
    : {};

  const excavationRaw = Array.isArray(r.excavation_questions) ? r.excavation_questions : [];
  const excavation_questions = excavationRaw
    .filter((q): q is Record<string, unknown> => Boolean(q && typeof q === 'object'))
    .map((q) => ({
      question: typeof q.question === 'string' ? q.question : '',
      what_we_are_looking_for: typeof q.what_we_are_looking_for === 'string' ? q.what_we_are_looking_for : '',
      resume_reference: typeof q.resume_reference === 'string' ? q.resume_reference : undefined,
    }))
    .filter((q) => q.question.length > 0);

  const profile_gaps = Array.isArray(r.profile_gaps)
    ? (r.profile_gaps as unknown[]).filter((g): g is string => typeof g === 'string' && g.length > 0)
    : fallback.profile_gaps;

  const concernsRaw = Array.isArray(r.hiring_manager_concerns) ? r.hiring_manager_concerns : [];
  const hiring_manager_concerns = concernsRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      objection: typeof c.objection === 'string' ? c.objection : '',
      neutralization_strategy: typeof c.neutralization_strategy === 'string' ? c.neutralization_strategy : '',
    }))
    .filter((c) => c.objection.length > 0);

  return {
    recognition: {
      career_thread: typeof recognition.career_thread === 'string' && recognition.career_thread.length > 0
        ? recognition.career_thread
        : fallback.recognition.career_thread,
      role_fit: typeof recognition.role_fit === 'string' && recognition.role_fit.length > 0
        ? recognition.role_fit
        : fallback.recognition.role_fit,
      differentiator: typeof recognition.differentiator === 'string' && recognition.differentiator.length > 0
        ? recognition.differentiator
        : fallback.recognition.differentiator,
    },
    excavation_questions: excavation_questions.length > 0 ? excavation_questions : fallback.excavation_questions,
    profile_gaps: profile_gaps.length > 0 ? profile_gaps : fallback.profile_gaps,
    hiring_manager_concerns: hiring_manager_concerns.length > 0 ? hiring_manager_concerns : fallback.hiring_manager_concerns,
  };
}
