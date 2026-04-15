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
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { CandidateIntelligenceOutput, JobIntelligenceOutput, BenchmarkCandidateOutput } from '../resume-v2/types.js';
import type { DiscoveryOutput } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ synthesis engine. You have conducted a full discovery flow with this candidate — you read their resume, analyzed the job, delivered a recognition statement, and ran an excavation conversation. Now you must synthesize everything into a durable CareerProfileV2.

This profile will be used by future AI agents across the platform. It must be specific, evidence-backed, and useful as a foundation for generating resumes, cover letters, interview prep, and LinkedIn content.

FORBIDDEN PHRASES — none of these should appear anywhere in the output:
- "results-driven", "leveraged", "spearheaded", "aligns with", "strong candidate"
- "unique combination", "proven track record", "extensive experience"
- "passionate about", "dynamic professional", "thought leader"
- any phrase that sounds like it was written by a job posting generator

OUTPUT FORMAT: Return valid JSON matching this structure exactly:
{
  "version": "career_profile_v2",
  "source": "discovery",
  "generated_at": "ISO 8601 timestamp",
  "targeting": {
    "target_roles": ["role from JD and career themes"],
    "target_industries": ["industry from JD"],
    "seniority": "director|vp|c-suite|senior-manager|manager",
    "transition_type": "growth|pivot|lateral|return|voluntary",
    "preferred_company_environments": []
  },
  "positioning": {
    "core_strengths": ["3-5 specific capabilities — what they are actually exceptional at"],
    "proof_themes": ["2-4 repeatable patterns of impact"],
    "differentiators": ["what makes them unusual or hard to replace"],
    "adjacent_positioning": [],
    "positioning_statement": "one sentence — why companies hire this person (repeatable-pattern language)",
    "narrative_summary": "2-3 sentence career story optimized for positioning",
    "leadership_scope": "scale of biggest leadership footprint",
    "scope_of_responsibility": "domains owned at peak"
  },
  "narrative": {
    "colleagues_came_for_what": "what colleagues bring to them beyond their title — first person, specific",
    "known_for_what": "what they are most known for professionally",
    "why_not_me": "honest factual reframe of the hardest hiring-manager objection",
    "story_snippet": "the one story that makes a hiring manager lean forward — 2-4 sentences"
  },
  "preferences": {
    "must_haves": [],
    "constraints": [],
    "compensation_direction": ""
  },
  "coaching": {
    "financial_segment": "ideal",
    "emotional_state": "acceptance",
    "coaching_tone": "direct",
    "urgency_score": 5,
    "recommended_starting_point": "resume"
  },
  "evidence_positioning_statements": ["3-5 statements: [strength] demonstrated through [evidence], applicable to [role type]"],
  "profile_signals": {
    "clarity": "green|yellow|red",
    "alignment": "green|yellow|red",
    "differentiation": "green|yellow|red"
  },
  "completeness": {
    "overall_score": 75,
    "dashboard_state": "new-user|refining|strong",
    "sections": [
      { "id": "direction", "label": "Direction", "status": "ready|partial|missing", "score": 85, "summary": "one sentence" },
      { "id": "positioning", "label": "Positioning", "status": "ready|partial|missing", "score": 75, "summary": "one sentence" },
      { "id": "narrative", "label": "Narrative", "status": "ready|partial|missing", "score": 70, "summary": "one sentence" },
      { "id": "constraints", "label": "Preferences", "status": "missing", "score": 15, "summary": "Preferences not yet collected." }
    ]
  },
  "profile_summary": "2-3 sentence positioning statement that will seed resume summaries and cover letters"
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
}): CareerProfileV2 {
  const { candidate, job_intelligence, benchmark, discovery } = input;
  const now = new Date().toISOString();

  const coreStrengths = candidate.career_themes.slice(0, 5);
  const differentiators = benchmark.hiring_manager_objections.slice(0, 2).map((o) => o.neutralization_strategy);
  const positioningStatement = discovery.recognition.differentiator || discovery.recognition.career_thread;

  return {
    version: 'career_profile_v2',
    source: 'discovery',
    generated_at: now,
    targeting: {
      target_roles: [job_intelligence.role_title].filter(Boolean),
      target_industries: [job_intelligence.industry].filter(Boolean),
      seniority: 'not yet defined',
      transition_type: 'voluntary',
      preferred_company_environments: [],
    },
    positioning: {
      core_strengths: coreStrengths,
      proof_themes: candidate.quantified_outcomes.slice(0, 3).map((o) => `${o.outcome}: ${o.value}`),
      differentiators,
      adjacent_positioning: [],
      positioning_statement: positioningStatement,
      narrative_summary: discovery.recognition.career_thread,
      leadership_scope: '',
      scope_of_responsibility: '',
    },
    narrative: {
      colleagues_came_for_what: '',
      known_for_what: discovery.recognition.role_fit,
      why_not_me: benchmark.hiring_manager_objections[0]?.neutralization_strategy ?? '',
      story_snippet: discovery.recognition.career_thread,
    },
    preferences: {
      must_haves: [],
      constraints: [],
      compensation_direction: '',
    },
    coaching: {
      financial_segment: 'ideal',
      emotional_state: 'acceptance',
      coaching_tone: 'direct',
      urgency_score: 5,
      recommended_starting_point: 'resume',
    },
    evidence_positioning_statements: benchmark.direct_matches.slice(0, 3).map(
      (m) => `${m.jd_requirement}: ${m.candidate_evidence}`,
    ),
    profile_signals: { clarity: 'yellow', alignment: 'yellow', differentiation: 'yellow' },
    completeness: {
      overall_score: 50,
      dashboard_state: 'refining',
      sections: [
        { id: 'direction', label: 'Direction', status: 'partial', score: 65, summary: 'Target role identified from job description.' },
        { id: 'positioning', label: 'Positioning', status: 'partial', score: 55, summary: 'Core themes identified from resume.' },
        { id: 'narrative', label: 'Narrative', status: 'partial', score: 45, summary: 'Career thread established from discovery.' },
        { id: 'constraints', label: 'Preferences', status: 'missing', score: 15, summary: 'Preferences not yet collected.' },
      ],
    },
    profile_summary: positioningStatement,
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function s(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sa(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return result.length > 0 ? result : fallback;
}

function n(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeCareerProfileV2Discovery(raw: unknown, fallback: CareerProfileV2): CareerProfileV2 {
  const r = raw as Record<string, unknown>;

  const targeting = rec(r.targeting);
  const positioning = rec(r.positioning);
  const narrative = rec(r.narrative);
  const preferences = rec(r.preferences);
  const coaching = rec(r.coaching);
  const profileSignals = rec(r.profile_signals);
  const completeness = rec(r.completeness);

  const validSectionIds = ['direction', 'positioning', 'narrative', 'constraints'] as const;
  const sectionsRaw = Array.isArray(completeness.sections) ? completeness.sections : [];
  const sections = sectionsRaw
    .filter((sec): sec is Record<string, unknown> => Boolean(sec && typeof sec === 'object'))
    .filter((sec) => validSectionIds.includes(sec.id as typeof validSectionIds[number]))
    .map((sec) => ({
      id: sec.id as typeof validSectionIds[number],
      label: s(sec.label, String(sec.id)),
      status: (['ready', 'partial', 'missing'] as const).includes(sec.status as 'ready' | 'partial' | 'missing')
        ? (sec.status as 'ready' | 'partial' | 'missing')
        : 'partial' as const,
      score: n(sec.score, 50),
      summary: s(sec.summary),
    }));

  const overallScore = n(completeness.overall_score, fallback.completeness.overall_score);
  const dashboardStateRaw = s(completeness.dashboard_state);
  const dashboardState = (['new-user', 'refining', 'strong'] as const).includes(dashboardStateRaw as 'new-user' | 'refining' | 'strong')
    ? (dashboardStateRaw as 'new-user' | 'refining' | 'strong')
    : fallback.completeness.dashboard_state;

  const signalFor = (key: string): 'green' | 'yellow' | 'red' => {
    const v = s(profileSignals[key]);
    return (['green', 'yellow', 'red'] as const).includes(v as 'green' | 'yellow' | 'red')
      ? (v as 'green' | 'yellow' | 'red')
      : 'yellow';
  };

  return {
    version: 'career_profile_v2',
    source: 'discovery',
    generated_at: s(r.generated_at) || new Date().toISOString(),
    targeting: {
      target_roles: sa(targeting.target_roles, fallback.targeting.target_roles),
      target_industries: sa(targeting.target_industries, fallback.targeting.target_industries),
      seniority: s(targeting.seniority, fallback.targeting.seniority),
      transition_type: s(targeting.transition_type, fallback.targeting.transition_type),
      preferred_company_environments: sa(targeting.preferred_company_environments, fallback.targeting.preferred_company_environments),
    },
    positioning: {
      core_strengths: sa(positioning.core_strengths, fallback.positioning.core_strengths),
      proof_themes: sa(positioning.proof_themes, fallback.positioning.proof_themes),
      differentiators: sa(positioning.differentiators, fallback.positioning.differentiators),
      adjacent_positioning: sa(positioning.adjacent_positioning, fallback.positioning.adjacent_positioning),
      positioning_statement: s(positioning.positioning_statement, fallback.positioning.positioning_statement),
      narrative_summary: s(positioning.narrative_summary, fallback.positioning.narrative_summary),
      leadership_scope: s(positioning.leadership_scope, fallback.positioning.leadership_scope),
      scope_of_responsibility: s(positioning.scope_of_responsibility, fallback.positioning.scope_of_responsibility),
    },
    narrative: {
      colleagues_came_for_what: s(narrative.colleagues_came_for_what, fallback.narrative.colleagues_came_for_what),
      known_for_what: s(narrative.known_for_what, fallback.narrative.known_for_what),
      why_not_me: s(narrative.why_not_me, fallback.narrative.why_not_me),
      story_snippet: s(narrative.story_snippet, fallback.narrative.story_snippet),
    },
    preferences: {
      must_haves: sa(preferences.must_haves, fallback.preferences.must_haves),
      constraints: sa(preferences.constraints, fallback.preferences.constraints),
      compensation_direction: s(preferences.compensation_direction, fallback.preferences.compensation_direction),
    },
    coaching: {
      financial_segment: s(coaching.financial_segment, fallback.coaching.financial_segment),
      emotional_state: s(coaching.emotional_state, fallback.coaching.emotional_state),
      coaching_tone: s(coaching.coaching_tone, fallback.coaching.coaching_tone),
      urgency_score: n(coaching.urgency_score, fallback.coaching.urgency_score),
      recommended_starting_point: s(coaching.recommended_starting_point, fallback.coaching.recommended_starting_point),
    },
    evidence_positioning_statements: sa(r.evidence_positioning_statements, fallback.evidence_positioning_statements),
    profile_signals: {
      clarity: signalFor('clarity'),
      alignment: signalFor('alignment'),
      differentiation: signalFor('differentiation'),
    },
    completeness: {
      overall_score: overallScore,
      dashboard_state: dashboardState,
      sections: sections.length > 0 ? sections : fallback.completeness.sections,
    },
    profile_summary: s(r.profile_summary, fallback.profile_summary),
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
): Promise<CareerProfileV2> {
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

    const parsed = repairJSON<CareerProfileV2>(response.text);
    if (parsed) return normalizeCareerProfileV2Discovery(parsed, fallback);

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

    const retryParsed = repairJSON<CareerProfileV2>(retry.text);
    if (retryParsed) return normalizeCareerProfileV2Discovery(retryParsed, fallback);

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
