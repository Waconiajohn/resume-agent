/**
 * Profile Setup — Synthesizer Agent
 *
 * Single-prompt agent. Reads all intake analysis + the full interview transcript
 * and produces a CareerProfileV2 — the complete, polished profile.
 *
 * One LLM call. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type { CareerProfileV2 } from '../../lib/career-profile-context.js';
import type { ProfileSetupInput, IntakeAnalysis, InterviewAnswer } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ synthesis agent. The intake analysis and interview are complete. Now you must produce the finished career profile in CareerProfileV2 format.

FORBIDDEN PHRASES — none of these may appear anywhere in the output:
- "results-driven", "results-oriented", "detail-oriented", "self-starter"
- "leveraged", "leveraging", "spearheaded", "orchestrated", "championed"
- "high-stakes", "high stakes", "high-impact", "cutting-edge", "best-in-class"
- "proven track record", "extensive experience", "strong background"
- "passionate about", "dedicated to", "committed to excellence"
- "dynamic professional", "thought leader", "visionary leader"
- "unique combination", "unique blend", "unique ability"
- "aligns with", "strong candidate", "ideal candidate"
- "fast-paced environment", "cross-functional collaboration"
- "strategic vision", "transformative", "holistic approach"
- "robust", "synergy", "paradigm", "ecosystem"
- any phrase that sounds like it was written by ChatGPT, a job posting generator, or a LinkedIn influencer
Write like a real person talking about what they actually do, not like a press release.

FIELD GUIDANCE:

targeting.target_roles — List of specific role titles the candidate is pursuing. Derive from stated target roles and career direction revealed in the interview.

targeting.target_industries — Industries where the candidate's experience is strongest or where they are explicitly targeting.

targeting.seniority — The level: "director", "vp", "c-suite", "senior-manager", etc.

targeting.transition_type — "growth" (moving up), "pivot" (changing direction), "lateral" (same level new context), "return" (re-entering), or "voluntary".

positioning.core_strengths — 3-5 specific capabilities. Not resume-speak. What EXACTLY are they good at, backed by evidence.

positioning.proof_themes — 2-4 repeatable patterns of impact that show up across multiple roles.

positioning.differentiators — What makes this person unusual or hard to replace. The intersection of capabilities most candidates don't have together.

positioning.positioning_statement — The one sentence that explains why companies hire this person. Must be repeatable-pattern language, not a single-project recap.

positioning.narrative_summary — 2-3 sentences. The career story told for maximum positioning impact.

positioning.leadership_scope — The scale of their biggest leadership footprint (team size, budget, revenue responsibility, geographic scope).

positioning.scope_of_responsibility — What domains they have owned at their peak.

narrative.colleagues_came_for_what — What colleagues consistently bring to this person that has nothing to do with their job title. First person. Specific.

narrative.known_for_what — What this person is most known for professionally. Should match the positioning_statement but in a more personal register.

narrative.why_not_me — The honest answer to the hardest hiring-manager objection about this background. Not denial. A factual reframe.

narrative.story_snippet — The one story that makes a hiring manager lean forward. 2-4 sentences. From the interview answers.

preferences.must_haves — Non-negotiable requirements for the next role.

preferences.constraints — Real constraints: geography, travel tolerance, company stage, culture fit.

preferences.compensation_direction — What they need directionally (not a specific number).

coaching.financial_segment — "crisis", "stressed", "ideal", or "comfortable". Infer from context — never ask directly.

coaching.emotional_state — "denial", "anger", "bargaining", "depression", or "acceptance".

coaching.coaching_tone — "direct", "supportive", or "exploratory".

coaching.urgency_score — 1-10. How urgently they need to land a role.

coaching.recommended_starting_point — "resume", "interview-prep", "positioning", or "networking".

evidence_positioning_statements — 3-5 statements that connect a specific capability to a specific role requirement. Format: "[strength] demonstrated through [specific evidence], directly applicable to [role type]."

profile_signals.clarity — How clearly defined their direction is: "green" (clear), "yellow" (emerging), "red" (unclear).

profile_signals.alignment — How well their background aligns with their target: "green", "yellow", "red".

profile_signals.differentiation — How differentiated their positioning is: "green", "yellow", "red".

completeness — Score each section 0-100 and classify as "ready" (>=85), "partial" (>=45), or "missing" (<45). Overall score is the average.

profile_summary — The 2-3 sentence positioning statement that will seed the resume summary, cover letters, and interview prep across the platform.

OUTPUT FORMAT: Return valid JSON matching this structure exactly:
{
  "version": "career_profile_v2",
  "source": "profile-setup",
  "generated_at": "ISO 8601 timestamp",
  "targeting": {
    "target_roles": ["role 1", "role 2"],
    "target_industries": ["industry 1"],
    "seniority": "director|vp|c-suite|senior-manager|manager",
    "transition_type": "growth|pivot|lateral|return|voluntary",
    "preferred_company_environments": ["environment 1"]
  },
  "positioning": {
    "core_strengths": ["strength 1", "strength 2", "strength 3"],
    "proof_themes": ["theme 1", "theme 2"],
    "differentiators": ["differentiator 1"],
    "adjacent_positioning": ["adjacent area 1"],
    "positioning_statement": "one sentence — why companies hire this person",
    "narrative_summary": "2-3 sentence career story",
    "leadership_scope": "scale of biggest leadership footprint",
    "scope_of_responsibility": "domains owned at peak"
  },
  "narrative": {
    "colleagues_came_for_what": "what colleagues bring to them beyond their title",
    "known_for_what": "what they are most known for",
    "why_not_me": "honest answer to the hardest objection",
    "story_snippet": "the story that makes a hiring manager lean forward"
  },
  "preferences": {
    "must_haves": ["must-have 1"],
    "constraints": ["constraint 1"],
    "compensation_direction": "directional statement"
  },
  "coaching": {
    "financial_segment": "crisis|stressed|ideal|comfortable",
    "emotional_state": "denial|anger|bargaining|depression|acceptance",
    "coaching_tone": "direct|supportive|exploratory",
    "urgency_score": 5,
    "recommended_starting_point": "resume|interview-prep|positioning|networking"
  },
  "evidence_positioning_statements": ["statement 1", "statement 2", "statement 3"],
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
      { "id": "constraints", "label": "Preferences", "status": "ready|partial|missing", "score": 65, "summary": "one sentence" }
    ]
  },
  "profile_summary": "2-3 sentence positioning statement"
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
): CareerProfileV2 {
  const targetRolesArray = input.target_roles
    .split(/[,\n]/)
    .map((r) => r.trim())
    .filter((r) => r.length > 0);

  const now = new Date().toISOString();

  return {
    version: 'career_profile_v2',
    source: 'profile-setup',
    generated_at: now,
    targeting: {
      target_roles: targetRolesArray,
      target_industries: [],
      seniority: 'not yet defined',
      transition_type: 'voluntary',
      preferred_company_environments: [],
    },
    positioning: {
      core_strengths: intake.top_capabilities.map((c) => c.capability),
      proof_themes: [],
      differentiators: [],
      adjacent_positioning: [],
      positioning_statement: intake.why_me_draft,
      narrative_summary: intake.career_thread,
      leadership_scope: '',
      scope_of_responsibility: '',
    },
    narrative: {
      colleagues_came_for_what: '',
      known_for_what: intake.why_me_draft,
      why_not_me: intake.primary_concern ?? '',
      story_snippet: intake.career_thread,
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
    evidence_positioning_statements: [],
    profile_signals: {
      clarity: 'yellow',
      alignment: 'yellow',
      differentiation: 'yellow',
    },
    completeness: {
      overall_score: 40,
      dashboard_state: 'refining',
      sections: [
        { id: 'direction', label: 'Direction', status: targetRolesArray.length > 0 ? 'partial' : 'missing', score: targetRolesArray.length > 0 ? 65 : 15, summary: 'Target roles identified from input.' },
        { id: 'positioning', label: 'Positioning', status: 'partial', score: 50, summary: 'Core strengths identified from resume.' },
        { id: 'narrative', label: 'Narrative', status: 'partial', score: 40, summary: 'Career thread established from intake.' },
        { id: 'constraints', label: 'Preferences', status: 'missing', score: 15, summary: 'Preferences not yet defined.' },
      ],
    },
    profile_summary: intake.why_me_draft,
  };
}

function shouldRethrowForAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  return error instanceof Error && /aborted/i.test(error.message);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function strArr(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return result.length > 0 ? result : fallback;
}

function numField(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function subRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeCareerProfileV2(raw: unknown, fallback: CareerProfileV2): CareerProfileV2 {
  const r = raw as Record<string, unknown>;

  const targeting = subRecord(r.targeting);
  const positioning = subRecord(r.positioning);
  const narrative = subRecord(r.narrative);
  const preferences = subRecord(r.preferences);
  const coaching = subRecord(r.coaching);
  const profileSignals = subRecord(r.profile_signals);
  const completeness = subRecord(r.completeness);

  const sectionsRaw = Array.isArray(completeness.sections) ? completeness.sections : [];
  const validSectionIds = ['direction', 'positioning', 'narrative', 'constraints'] as const;
  const sections = sectionsRaw
    .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
    .filter((s) => validSectionIds.includes(s.id as typeof validSectionIds[number]))
    .map((s) => ({
      id: s.id as typeof validSectionIds[number],
      label: str(s.label, String(s.id)),
      status: (['ready', 'partial', 'missing'] as const).includes(s.status as 'ready' | 'partial' | 'missing')
        ? (s.status as 'ready' | 'partial' | 'missing')
        : 'partial' as const,
      score: numField(s.score, 50),
      summary: str(s.summary),
    }));

  const overallScore = numField(completeness.overall_score, fallback.completeness.overall_score);
  // Compute dashboard_state deterministically from score — never trust the LLM's value
  const dashboardState: 'new-user' | 'refining' | 'strong' =
    overallScore >= 80 ? 'strong' : overallScore >= 30 ? 'refining' : 'new-user';

  const signalFor = (key: string): 'green' | 'yellow' | 'red' => {
    const v = str(profileSignals[key]);
    return (['green', 'yellow', 'red'] as const).includes(v as 'green' | 'yellow' | 'red')
      ? (v as 'green' | 'yellow' | 'red')
      : 'yellow';
  };

  return {
    version: 'career_profile_v2',
    source: 'profile-setup',
    generated_at: str(r.generated_at) || new Date().toISOString(),
    targeting: {
      target_roles: strArr(targeting.target_roles, fallback.targeting.target_roles),
      target_industries: strArr(targeting.target_industries, fallback.targeting.target_industries),
      seniority: str(targeting.seniority, fallback.targeting.seniority),
      transition_type: str(targeting.transition_type, fallback.targeting.transition_type),
      preferred_company_environments: strArr(targeting.preferred_company_environments, fallback.targeting.preferred_company_environments),
    },
    positioning: {
      core_strengths: strArr(positioning.core_strengths, fallback.positioning.core_strengths),
      proof_themes: strArr(positioning.proof_themes, fallback.positioning.proof_themes),
      differentiators: strArr(positioning.differentiators, fallback.positioning.differentiators),
      adjacent_positioning: strArr(positioning.adjacent_positioning, fallback.positioning.adjacent_positioning),
      positioning_statement: str(positioning.positioning_statement, fallback.positioning.positioning_statement),
      narrative_summary: str(positioning.narrative_summary, fallback.positioning.narrative_summary),
      leadership_scope: str(positioning.leadership_scope, fallback.positioning.leadership_scope),
      scope_of_responsibility: str(positioning.scope_of_responsibility, fallback.positioning.scope_of_responsibility),
    },
    narrative: {
      colleagues_came_for_what: str(narrative.colleagues_came_for_what, fallback.narrative.colleagues_came_for_what),
      known_for_what: str(narrative.known_for_what, fallback.narrative.known_for_what),
      why_not_me: str(narrative.why_not_me, fallback.narrative.why_not_me),
      story_snippet: str(narrative.story_snippet, fallback.narrative.story_snippet),
    },
    preferences: {
      must_haves: strArr(preferences.must_haves, fallback.preferences.must_haves),
      constraints: strArr(preferences.constraints, fallback.preferences.constraints),
      compensation_direction: str(preferences.compensation_direction, fallback.preferences.compensation_direction),
    },
    coaching: {
      financial_segment: str(coaching.financial_segment, fallback.coaching.financial_segment),
      emotional_state: str(coaching.emotional_state, fallback.coaching.emotional_state),
      coaching_tone: str(coaching.coaching_tone, fallback.coaching.coaching_tone),
      urgency_score: numField(coaching.urgency_score, fallback.coaching.urgency_score),
      recommended_starting_point: str(coaching.recommended_starting_point, fallback.coaching.recommended_starting_point),
    },
    evidence_positioning_statements: strArr(r.evidence_positioning_statements, fallback.evidence_positioning_statements),
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
    profile_summary: str(r.profile_summary, fallback.profile_summary),
  };
}

export async function synthesizeProfile(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
  answers: InterviewAnswer[],
  signal?: AbortSignal,
): Promise<CareerProfileV2> {
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

    const parsed = repairJSON<CareerProfileV2>(response.text);
    if (parsed) return normalizeCareerProfileV2(parsed, fallback);

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

    const retryParsed = repairJSON<CareerProfileV2>(retry.text);
    if (retryParsed) return normalizeCareerProfileV2(retryParsed, fallback);

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
