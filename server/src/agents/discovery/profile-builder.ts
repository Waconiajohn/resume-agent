/**
 * Discovery Agent — Profile Builder
 *
 * Synthesizes everything gathered during the discovery flow into a final
 * CareerIQ profile: a durable, structured view of this person's positioning
 * relative to the target role.
 *
 * Single LLM call.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { CandidateIntelligenceOutput, JobIntelligenceOutput, BenchmarkCandidateOutput } from '../resume-v2/types.js';
import type { DiscoveryOutput, CareerIQProfile } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ synthesis engine. You have conducted a full discovery flow with this candidate — you read their resume, analyzed the job, delivered a recognition statement, and ran an excavation conversation. Now you must synthesize everything into a durable profile.

This profile will be used by future AI agents across the platform. It must be specific, evidence-backed, and useful as a foundation for generating cover letters, interview prep, LinkedIn content, and salary negotiation strategy.

Produce four elements:

## 1. CAREER THREAD
The single most defensible narrative about who this person is professionally. Not their job title. Not their industry. The thing that shows up across every chapter of their career, made clearer by the excavation answers. 2-3 sentences. Specific enough that it could ONLY apply to this person.

## 2. EXCEPTIONAL AREAS
3-5 areas where this person has genuine evidence of being in the top tier. Not "strong communicator." What EXACTLY are they exceptional at, and what SPECIFICALLY proves it? Each area must be backed by a concrete evidence statement — a project, an outcome, a decision, a scale indicator.

## 3. ROLE FIT POINTS
3-5 specific points that make this person a fit for the target role. Not generic fit language. Each point maps a specific requirement from the job description to a specific piece of evidence from the candidate's background (including the excavation conversation).

## 4. HIRING MANAGER CONCERNS
The 2-3 most likely concerns a hiring manager would have after reviewing this person's materials, alongside a specific factual response to each. Not cheerleading. Not denial. A credible, evidence-backed response that acknowledges the concern and reframes it.

OUTPUT FORMAT: Return valid JSON:
{
  "career_thread": "2-3 sentences — the durable professional narrative",
  "exceptional_areas": [
    {
      "area": "the specific capability or domain",
      "evidence": "the specific proof — project, outcome, scale, or decision"
    }
  ],
  "role_fit_points": [
    {
      "point": "the specific fit claim",
      "evidence": "what from their background proves it"
    }
  ],
  "hiring_manager_concerns": [
    {
      "concern": "the specific concern",
      "response": "the specific factual response"
    }
  ]
}

CRITICAL JSON RULES:
- Return exactly one JSON object.
- The first character of your response must be { and the last character must be }.
- Do not wrap the JSON in markdown fences.
- Do not add commentary or text outside the JSON object.`;

function buildUserMessage(input: {
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
  discovery: DiscoveryOutput;
  excavation_answers: Array<{ question: string; answer: string }>;
}): string {
  const { candidate, job_intelligence, benchmark, discovery, excavation_answers } = input;

  const parts: string[] = [
    '## Candidate',
    `Name: ${candidate.contact.name}`,
    `Career span: ${candidate.career_span_years} years`,
    `Career themes: ${candidate.career_themes.join(', ')}`,
    '',
    'Experience:',
    ...candidate.experience.map(
      (e) => `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date})`,
    ),
    '',
    'Quantified outcomes:',
    ...candidate.quantified_outcomes.slice(0, 6).map(
      (o) => `- [${o.metric_type}] ${o.outcome}: ${o.value}`,
    ),
    '',
    '## Target Role',
    `${job_intelligence.role_title} at ${job_intelligence.company_name}`,
    `Industry: ${job_intelligence.industry}`,
    '',
    'Core requirements:',
    ...job_intelligence.core_competencies.map(
      (c) => `- [${c.importance}] ${c.competency}`,
    ),
    '',
    '## Benchmark Assessment',
    `Positioning frame: ${benchmark.positioning_frame}`,
    '',
    'Direct matches:',
    ...benchmark.direct_matches.map(
      (m) => `- [${m.strength}] ${m.jd_requirement}: ${m.candidate_evidence}`,
    ),
    '',
    'Hiring manager objections:',
    ...benchmark.hiring_manager_objections.map(
      (o) => `- ${o.objection}`,
    ),
    '',
    '## Recognition Statement (from initial discovery)',
    `Career thread: ${discovery.recognition.career_thread}`,
    `Role fit: ${discovery.recognition.role_fit}`,
    `Differentiator: ${discovery.recognition.differentiator}`,
    '',
    '## Excavation Conversation Answers',
    excavation_answers.length > 0
      ? excavation_answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')
      : '(no excavation answers recorded)',
    '',
    'Synthesize everything above into a durable CareerIQ profile. Return compact JSON only.',
  ];

  return parts.join('\n');
}

function buildDeterministicFallback(input: {
  candidate: CandidateIntelligenceOutput;
  job_intelligence: JobIntelligenceOutput;
  benchmark: BenchmarkCandidateOutput;
  discovery: DiscoveryOutput;
}): CareerIQProfile {
  const { candidate, job_intelligence: _job_intelligence, benchmark, discovery } = input;

  return {
    career_thread: discovery.recognition.career_thread,
    exceptional_areas: candidate.career_themes.slice(0, 3).map((theme, i) => ({
      area: theme,
      evidence: candidate.quantified_outcomes[i]
        ? `${candidate.quantified_outcomes[i].outcome}: ${candidate.quantified_outcomes[i].value}`
        : candidate.hidden_accomplishments[i] ?? 'Demonstrated across multiple roles',
    })),
    role_fit_points: benchmark.direct_matches.slice(0, 3).map((m) => ({
      point: m.jd_requirement,
      evidence: m.candidate_evidence,
    })),
    hiring_manager_concerns: benchmark.hiring_manager_objections.slice(0, 3).map((o) => ({
      concern: o.objection,
      response: o.neutralization_strategy,
    })),
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function normalizeCareerIQProfile(
  raw: CareerIQProfile,
  fallback: CareerIQProfile,
): CareerIQProfile {
  const r = raw as unknown as Record<string, unknown>;

  const exceptionalRaw = Array.isArray(r.exceptional_areas) ? r.exceptional_areas : [];
  const exceptional_areas = exceptionalRaw
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a) => ({
      area: typeof a.area === 'string' ? a.area : '',
      evidence: typeof a.evidence === 'string' ? a.evidence : '',
    }))
    .filter((a) => a.area.length > 0);

  const fitRaw = Array.isArray(r.role_fit_points) ? r.role_fit_points : [];
  const role_fit_points = fitRaw
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
    .map((p) => ({
      point: typeof p.point === 'string' ? p.point : '',
      evidence: typeof p.evidence === 'string' ? p.evidence : '',
    }))
    .filter((p) => p.point.length > 0);

  const concernsRaw = Array.isArray(r.hiring_manager_concerns) ? r.hiring_manager_concerns : [];
  const hiring_manager_concerns = concernsRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      concern: typeof c.concern === 'string' ? c.concern : '',
      response: typeof c.response === 'string' ? c.response : '',
    }))
    .filter((c) => c.concern.length > 0);

  return {
    career_thread: typeof r.career_thread === 'string' && r.career_thread.length > 0
      ? r.career_thread
      : fallback.career_thread,
    exceptional_areas: exceptional_areas.length > 0 ? exceptional_areas : fallback.exceptional_areas,
    role_fit_points: role_fit_points.length > 0 ? role_fit_points : fallback.role_fit_points,
    hiring_manager_concerns: hiring_manager_concerns.length > 0 ? hiring_manager_concerns : fallback.hiring_manager_concerns,
  };
}

export async function buildCareerIQProfile(
  input: {
    candidate: CandidateIntelligenceOutput;
    job_intelligence: JobIntelligenceOutput;
    benchmark: BenchmarkCandidateOutput;
    discovery: DiscoveryOutput;
    excavation_answers: Array<{ question: string; answer: string }>;
  },
  signal?: AbortSignal,
): Promise<CareerIQProfile> {
  const userMessage = buildUserMessage(input);
  const fallback = buildDeterministicFallback(input);

  try {
    const response = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const parsed = repairJSON<CareerIQProfile>(response.text);
    if (parsed) return normalizeCareerIQProfile(parsed, fallback);

    logger.warn(
      { rawSnippet: response.text.substring(0, 500) },
      'Profile Builder: first attempt unparseable, retrying',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      'Profile Builder: first attempt failed, using deterministic fallback',
    );
    return fallback;
  }

  try {
    const retry = await llm.chat({
      model: MODEL_PRIMARY,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage + '\n\nReturn ONLY valid JSON. Start with { and end with }. No markdown fences, no commentary.' }],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      signal,
    });

    const retryParsed = repairJSON<CareerIQProfile>(retry.text);
    if (retryParsed) return normalizeCareerIQProfile(retryParsed, fallback);

    logger.error(
      { rawSnippet: retry.text.substring(0, 500) },
      'Profile Builder: retry returned unparseable response, using deterministic fallback',
    );
  } catch (error) {
    if (shouldRethrowForAbort(error, signal)) throw error;
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Profile Builder: retry failed, using deterministic fallback',
    );
  }

  return fallback;
}
