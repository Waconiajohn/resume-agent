/**
 * Profile Setup — Synthesizer Agent
 *
 * Single-prompt agent. Reads all intake analysis + the full interview transcript
 * and produces a CareerProfileV2 — the complete, polished Benchmark Profile.
 *
 * One LLM call. Not an agentic loop.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../lib/llm.js';
import { repairJSON } from '../../lib/json-repair.js';
import logger from '../../lib/logger.js';
import type {
  BenchmarkProfileConfidence,
  BenchmarkProfileDiscoveryQuestion,
  BenchmarkProfileDownstreamTool,
  BenchmarkProfileDraftItem,
  BenchmarkProfileReviewStatus,
  BenchmarkProfileV1,
  CareerProfileV2,
} from '../../lib/career-profile-context.js';
import type { ProfileSetupInput, IntakeAnalysis, InterviewAnswer } from './types.js';

const SYSTEM_PROMPT = `You are the CareerIQ synthesis agent. The intake analysis and interview are complete. Now you must produce the finished Benchmark Profile in CareerProfileV2 format.

This profile is the source of truth that powers role-specific resumes, LinkedIn optimization, cover letters, networking messages, interview prep, thank-you notes, follow-up, and job targeting. Write it as reusable product intelligence, not as a decorative summary.

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

benchmark_profile — A richer product-intelligence payload that downstream tools can use without re-interviewing the user. Use confidence and review_status honestly:
- "high_confidence": directly supported by resume, LinkedIn, or interview answer.
- "good_inference": strongly suggested by evidence but should be quickly confirmed.
- "needs_answer": important but not knowable from the material.
- "risky_claim": promising but unsafe to use until confirmed.

For every claim, include evidence excerpts and used_by tools so the UI can explain why this matters.

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
  "profile_summary": "2-3 sentence positioning statement",
  "benchmark_profile": {
    "version": "benchmark_profile_v1",
    "generated_at": "ISO 8601 timestamp",
    "source_material_summary": {
      "resume_quality": "assessment of resume usefulness",
      "linkedin_quality": "assessment of LinkedIn usefulness",
      "strongest_inputs": ["best source material found"],
      "missing_inputs": ["important missing source material"]
    },
    "identity": {
      "benchmark_headline": { "id": "identity.headline", "label": "Benchmark headline", "statement": "one-line benchmark candidate identity", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] },
      "why_me_story": { "id": "identity.why_me", "label": "Why Me", "statement": "approved-quality Why Me story draft", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] },
      "why_not_me": { "id": "identity.why_not_me", "label": "Why Not Me", "statement": "hardest truthful caveat or walk-away rule", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] },
      "operating_identity": { "id": "identity.operating_identity", "label": "Operating identity", "statement": "how this person works when they are at their best", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] }
    },
    "proof": {
      "signature_accomplishments": [{ "id": "proof.1", "label": "Signature proof", "statement": "specific quantified accomplishment", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] }],
      "proof_themes": [{ "id": "proof.theme.1", "label": "Proof theme", "statement": "repeatable proof pattern", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] }],
      "scope_markers": [{ "id": "proof.scope.1", "label": "Scope marker", "statement": "team, budget, user, revenue, geography, system, or operational scale", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] }]
    },
    "linkedin_brand": {
      "five_second_verdict": { "id": "linkedin.five_second", "label": "Five-second test", "statement": "what a recruiter understands in five seconds", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["linkedin", "job_search"] },
      "headline_direction": { "id": "linkedin.headline", "label": "Headline direction", "statement": "recommended headline strategy", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["linkedin", "job_search"] },
      "about_opening": { "id": "linkedin.about_opening", "label": "About opening", "statement": "recommended first visible LinkedIn About line", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["linkedin", "networking", "cover_letter"] },
      "recruiter_keywords": ["keyword 1", "keyword 2"],
      "content_pillars": [{ "id": "linkedin.content.1", "label": "Content pillar", "statement": "posting/blogging theme grounded in proof", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["linkedin"] }],
      "profile_gaps": [{ "id": "linkedin.gap.1", "label": "LinkedIn gap", "statement": "profile gap to fix", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["linkedin"] }]
    },
    "risk_and_gaps": {
      "objections": [{ "id": "risk.objection.1", "label": "Objection", "statement": "likely hiring-manager concern", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "cover_letter", "interview"] }],
      "adjacent_proof_needed": [{ "id": "risk.adjacent.1", "label": "Adjacent proof needed", "statement": "promising adjacent skill that needs confirmation", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "interview"] }],
      "claims_to_soften": [{ "id": "risk.soften.1", "label": "Claim to soften", "statement": "claim that should be phrased carefully", "confidence": "high_confidence|good_inference|needs_answer|risky_claim", "review_status": "draft|needs_confirmation|approved|needs_evidence", "source": "resume|linkedin|interview|inference|user", "evidence": ["source evidence"], "used_by": ["resume", "linkedin", "cover_letter"] }]
    },
    "approved_language": {
      "positioning_statement": "draft language to approve",
      "resume_summary_seed": "draft resume summary seed",
      "linkedin_opening": "draft LinkedIn opening",
      "networking_intro": "draft networking intro",
      "cover_letter_thesis": "draft cover letter thesis"
    },
    "discovery_questions": [
      { "id": "dq.1", "question": "pointed confirmation question", "why_it_matters": "why this improves downstream output", "evidence_found": ["evidence that triggered question"], "recommended_answer": "optional recommended answer", "confidence_if_confirmed": "high_confidence|good_inference|needs_answer|risky_claim", "used_by": ["resume", "linkedin", "cover_letter", "networking", "interview", "job_search", "thank_you", "follow_up"] }
    ],
    "downstream_readiness": {
      "resume": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "linkedin": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "cover_letter": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "networking": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "interview": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "job_search": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "thank_you": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" },
      "follow_up": { "status": "ready|usable|needs_review|blocked", "summary": "one sentence" }
    }
  }
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
    '### LinkedIn Profile Text',
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

  parts.push('Synthesize the complete Benchmark Profile from everything above. Return compact JSON only.');

  return parts.filter((p) => p !== undefined).join('\n');
}

const DOWNSTREAM_TOOLS: BenchmarkProfileDownstreamTool[] = [
  'resume',
  'linkedin',
  'cover_letter',
  'networking',
  'interview',
  'job_search',
  'thank_you',
  'follow_up',
];

const BENCHMARK_CONFIDENCES: BenchmarkProfileConfidence[] = [
  'high_confidence',
  'good_inference',
  'needs_answer',
  'risky_claim',
];

const BENCHMARK_REVIEW_STATUSES: BenchmarkProfileReviewStatus[] = [
  'draft',
  'needs_confirmation',
  'approved',
  'needs_evidence',
];

const BENCHMARK_SOURCES: BenchmarkProfileDraftItem['source'][] = [
  'resume',
  'linkedin',
  'interview',
  'inference',
  'user',
];

function benchmarkItem(args: {
  id: string;
  label: string;
  statement: string;
  confidence?: BenchmarkProfileConfidence;
  review_status?: BenchmarkProfileReviewStatus;
  source?: BenchmarkProfileDraftItem['source'];
  evidence?: string[];
  used_by?: BenchmarkProfileDownstreamTool[];
}): BenchmarkProfileDraftItem {
  return {
    id: args.id,
    label: args.label,
    statement: args.statement,
    confidence: args.confidence ?? 'good_inference',
    review_status: args.review_status ?? 'needs_confirmation',
    source: args.source ?? 'inference',
    evidence: args.evidence ?? [],
    used_by: args.used_by ?? DOWNSTREAM_TOOLS,
  };
}

function readiness(summary: string, status: 'ready' | 'usable' | 'needs_review' | 'blocked' = 'usable') {
  return { status, summary };
}

function buildFallbackBenchmarkProfile(
  input: ProfileSetupInput,
  intake: IntakeAnalysis,
  targetRoles: string[],
  generatedAt: string,
): BenchmarkProfileV1 {
  const topCapabilities = intake.top_capabilities.length > 0
    ? intake.top_capabilities
    : [{ capability: 'Career positioning', evidence: intake.career_thread }];
  const targetLabel = targetRoles.join(', ') || 'the target role';
  const hasLinkedIn = input.linkedin_about.trim().length > 0;
  const primaryConcern = intake.primary_concern ?? 'No single blocker is confirmed yet; validate any gaps against target jobs.';

  return {
    version: 'benchmark_profile_v1',
    generated_at: generatedAt,
    source_material_summary: {
      resume_quality: input.resume_text.length > 2_000
        ? 'Comprehensive enough to draft an initial proof map.'
        : 'Usable, but more detail would improve proof extraction.',
      linkedin_quality: hasLinkedIn
        ? 'LinkedIn profile text is available for public-brand and keyword analysis.'
        : 'LinkedIn profile text is missing; LinkedIn recommendations will be less precise.',
      strongest_inputs: [
        'Resume career history',
        ...topCapabilities.slice(0, 2).map((c) => c.evidence),
      ].filter(Boolean),
      missing_inputs: [
        ...(hasLinkedIn ? [] : ['LinkedIn profile text or PDF']),
        ...intake.profile_gaps,
      ].slice(0, 5),
    },
    identity: {
      benchmark_headline: benchmarkItem({
        id: 'identity.headline',
        label: 'Benchmark headline',
        statement: intake.career_thread || intake.why_me_draft,
        confidence: 'good_inference',
        evidence: topCapabilities.map((c) => c.evidence).slice(0, 3),
      }),
      why_me_story: benchmarkItem({
        id: 'identity.why_me',
        label: 'Why Me',
        statement: intake.why_me_draft,
        confidence: 'good_inference',
        evidence: topCapabilities.map((c) => c.evidence).slice(0, 3),
      }),
      why_not_me: benchmarkItem({
        id: 'identity.why_not_me',
        label: 'Why Not Me',
        statement: primaryConcern,
        confidence: intake.primary_concern ? 'good_inference' : 'needs_answer',
        review_status: intake.primary_concern ? 'needs_confirmation' : 'needs_evidence',
        evidence: intake.primary_concern ? [intake.primary_concern] : [],
      }),
      operating_identity: benchmarkItem({
        id: 'identity.operating_identity',
        label: 'Operating identity',
        statement: topCapabilities[0]?.capability ?? 'Career positioning',
        confidence: 'good_inference',
        evidence: topCapabilities.slice(0, 2).map((c) => c.evidence),
      }),
    },
    proof: {
      signature_accomplishments: topCapabilities.slice(0, 5).map((capability, index) => benchmarkItem({
        id: `proof.signature.${index + 1}`,
        label: capability.capability,
        statement: capability.evidence,
        confidence: 'good_inference',
        source: 'resume',
        evidence: [capability.evidence],
        used_by: ['resume', 'linkedin', 'cover_letter', 'networking', 'interview'],
      })),
      proof_themes: [
        benchmarkItem({
          id: 'proof.theme.1',
          label: 'Repeatable impact',
          statement: intake.career_thread,
          confidence: 'good_inference',
          evidence: topCapabilities.map((c) => c.evidence).slice(0, 3),
          used_by: ['resume', 'linkedin', 'cover_letter', 'interview'],
        }),
      ],
      scope_markers: intake.structured_experience
        .filter((entry) => entry.scope_statement.trim().length > 0)
        .slice(0, 4)
        .map((entry, index) => benchmarkItem({
          id: `proof.scope.${index + 1}`,
          label: `${entry.title} scope`,
          statement: entry.scope_statement,
          confidence: 'high_confidence',
          source: 'resume',
          evidence: [entry.scope_statement],
          used_by: ['resume', 'linkedin', 'cover_letter', 'interview'],
        })),
    },
    linkedin_brand: {
      five_second_verdict: benchmarkItem({
        id: 'linkedin.five_second',
        label: 'Five-second test',
        statement: hasLinkedIn
          ? 'LinkedIn text is available; confirm whether the first visible lines make the benchmark angle obvious.'
          : 'LinkedIn text is missing, so the app cannot yet score the public five-second impression.',
        confidence: hasLinkedIn ? 'good_inference' : 'needs_answer',
        review_status: hasLinkedIn ? 'needs_confirmation' : 'needs_evidence',
        source: hasLinkedIn ? 'linkedin' : 'inference',
        evidence: hasLinkedIn ? ['LinkedIn profile text provided'] : [],
        used_by: ['linkedin', 'job_search'],
      }),
      headline_direction: benchmarkItem({
        id: 'linkedin.headline',
        label: 'Headline direction',
        statement: `Position the profile around ${targetLabel} using the strongest proof themes, not only current job titles.`,
        confidence: 'good_inference',
        used_by: ['linkedin', 'job_search'],
      }),
      about_opening: benchmarkItem({
        id: 'linkedin.about_opening',
        label: 'About opening',
        statement: intake.why_me_draft,
        confidence: 'good_inference',
        evidence: topCapabilities.map((c) => c.evidence).slice(0, 2),
        used_by: ['linkedin', 'networking', 'cover_letter'],
      }),
      recruiter_keywords: [
        ...targetRoles,
        ...topCapabilities.map((c) => c.capability),
      ].filter(Boolean).slice(0, 12),
      content_pillars: topCapabilities.slice(0, 4).map((capability, index) => benchmarkItem({
        id: `linkedin.content.${index + 1}`,
        label: capability.capability,
        statement: `Write about ${capability.capability.toLowerCase()} through real examples from the resume.`,
        confidence: 'good_inference',
        evidence: [capability.evidence],
        used_by: ['linkedin'],
      })),
      profile_gaps: [
        ...(hasLinkedIn ? [] : [benchmarkItem({
          id: 'linkedin.gap.1',
          label: 'LinkedIn source missing',
          statement: 'Add LinkedIn profile text or a PDF to improve keyword, headline, and About-section recommendations.',
          confidence: 'needs_answer',
          review_status: 'needs_evidence',
          used_by: ['linkedin'],
        })]),
      ],
    },
    risk_and_gaps: {
      objections: [
        benchmarkItem({
          id: 'risk.objection.1',
          label: 'Likely objection',
          statement: primaryConcern,
          confidence: intake.primary_concern ? 'good_inference' : 'needs_answer',
          review_status: intake.primary_concern ? 'needs_confirmation' : 'needs_evidence',
          used_by: ['resume', 'cover_letter', 'interview'],
        }),
      ],
      adjacent_proof_needed: intake.profile_gaps.slice(0, 4).map((gap, index) => benchmarkItem({
        id: `risk.adjacent.${index + 1}`,
        label: 'Proof to confirm',
        statement: gap,
        confidence: 'needs_answer',
        review_status: 'needs_evidence',
        used_by: ['resume', 'linkedin', 'interview'],
      })),
      claims_to_soften: [],
    },
    approved_language: {
      positioning_statement: intake.career_thread,
      resume_summary_seed: intake.why_me_draft,
      linkedin_opening: intake.why_me_draft,
      networking_intro: intake.career_thread,
      cover_letter_thesis: intake.why_me_draft,
    },
    discovery_questions: intake.interview_questions.slice(0, 8).map((question, index) => ({
      id: `dq.${index + 1}`,
      question: question.question,
      why_it_matters: question.what_we_are_looking_for,
      evidence_found: question.references_resume_element ? [question.references_resume_element] : [],
      recommended_answer: question.suggested_starters.find((starter) => starter !== 'Something else'),
      confidence_if_confirmed: 'high_confidence',
      used_by: DOWNSTREAM_TOOLS,
    })),
    downstream_readiness: {
      resume: readiness('Usable for first resume tailoring; stronger proof confirmation will improve quality.'),
      linkedin: readiness(hasLinkedIn ? 'Usable for LinkedIn audit and rewrite.' : 'Blocked until LinkedIn profile text is provided.', hasLinkedIn ? 'usable' : 'blocked'),
      cover_letter: readiness('Usable for a first cover-letter thesis.'),
      networking: readiness('Usable for concise outreach positioning.'),
      interview: readiness('Usable for first interview-prep story framing.'),
      job_search: readiness(targetRoles.length > 0 ? 'Target roles are available for fit filtering.' : 'Needs target-role confirmation.', targetRoles.length > 0 ? 'usable' : 'needs_review'),
      thank_you: readiness('Usable once an interview context exists.'),
      follow_up: readiness('Usable once application context exists.'),
    },
  };
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
    benchmark_profile: buildFallbackBenchmarkProfile(input, intake, targetRolesArray, now),
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

function enumField<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeBenchmarkTools(value: unknown, fallback: BenchmarkProfileDownstreamTool[] = DOWNSTREAM_TOOLS): BenchmarkProfileDownstreamTool[] {
  if (!Array.isArray(value)) return fallback;
  const tools = value.filter((tool): tool is BenchmarkProfileDownstreamTool => DOWNSTREAM_TOOLS.includes(tool as BenchmarkProfileDownstreamTool));
  return tools.length > 0 ? [...new Set(tools)] : fallback;
}

function normalizeBenchmarkItem(raw: unknown, fallback: BenchmarkProfileDraftItem): BenchmarkProfileDraftItem {
  const item = subRecord(raw);
  return {
    id: str(item.id, fallback.id),
    label: str(item.label, fallback.label),
    statement: str(item.statement, fallback.statement),
    confidence: enumField(item.confidence, BENCHMARK_CONFIDENCES, fallback.confidence),
    review_status: enumField(item.review_status, BENCHMARK_REVIEW_STATUSES, fallback.review_status),
    source: enumField(item.source, BENCHMARK_SOURCES, fallback.source),
    evidence: strArr(item.evidence, fallback.evidence),
    used_by: normalizeBenchmarkTools(item.used_by, fallback.used_by),
  };
}

function normalizeBenchmarkItemArray(raw: unknown, fallback: BenchmarkProfileDraftItem[]): BenchmarkProfileDraftItem[] {
  if (!Array.isArray(raw)) return fallback;
  const normalized = raw
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item, index) => normalizeBenchmarkItem(item, fallback[index] ?? benchmarkItem({
      id: `generated.${index + 1}`,
      label: 'Draft item',
      statement: '',
      confidence: 'needs_answer',
      review_status: 'needs_evidence',
    })))
    .filter((item) => item.statement.trim().length > 0);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeDiscoveryQuestions(raw: unknown, fallback: BenchmarkProfileDiscoveryQuestion[]): BenchmarkProfileDiscoveryQuestion[] {
  if (!Array.isArray(raw)) return fallback;
  const normalized = raw
    .filter((question): question is Record<string, unknown> => Boolean(question && typeof question === 'object' && !Array.isArray(question)))
    .map((question, index) => {
      const fallbackQuestion = fallback[index] ?? {
        id: `dq.${index + 1}`,
        question: '',
        why_it_matters: '',
        evidence_found: [],
        confidence_if_confirmed: 'high_confidence' as BenchmarkProfileConfidence,
        used_by: DOWNSTREAM_TOOLS,
      };
      const recommended = str(question.recommended_answer, fallbackQuestion.recommended_answer ?? '');
      const answer = str(question.answer, fallbackQuestion.answer ?? '');
      const answeredAt = str(question.answered_at, fallbackQuestion.answered_at ?? '');
      return {
        id: str(question.id, fallbackQuestion.id),
        question: str(question.question, fallbackQuestion.question),
        why_it_matters: str(question.why_it_matters, fallbackQuestion.why_it_matters),
        evidence_found: strArr(question.evidence_found, fallbackQuestion.evidence_found),
        ...(recommended ? { recommended_answer: recommended } : {}),
        ...(answer ? { answer } : {}),
        ...(answeredAt ? { answered_at: answeredAt } : {}),
        confidence_if_confirmed: enumField(question.confidence_if_confirmed, BENCHMARK_CONFIDENCES, fallbackQuestion.confidence_if_confirmed),
        used_by: normalizeBenchmarkTools(question.used_by, fallbackQuestion.used_by),
      };
    })
    .filter((question) => question.question.trim().length > 0);
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeBenchmarkProfileV1(raw: unknown, fallback: BenchmarkProfileV1): BenchmarkProfileV1 {
  const r = subRecord(raw);
  const sourceMaterial = subRecord(r.source_material_summary);
  const identity = subRecord(r.identity);
  const proof = subRecord(r.proof);
  const linkedinBrand = subRecord(r.linkedin_brand);
  const riskAndGaps = subRecord(r.risk_and_gaps);
  const approvedLanguage = subRecord(r.approved_language);
  const readinessRaw = subRecord(r.downstream_readiness);

  const downstream_readiness = DOWNSTREAM_TOOLS.reduce<BenchmarkProfileV1['downstream_readiness']>((acc, tool) => {
    const rawTool = subRecord(readinessRaw[tool]);
    const fallbackTool = fallback.downstream_readiness[tool];
    acc[tool] = {
      status: enumField(rawTool.status, ['ready', 'usable', 'needs_review', 'blocked'] as const, fallbackTool.status),
      summary: str(rawTool.summary, fallbackTool.summary),
    };
    return acc;
  }, {} as BenchmarkProfileV1['downstream_readiness']);

  return {
    version: 'benchmark_profile_v1',
    generated_at: str(r.generated_at, fallback.generated_at),
    source_material_summary: {
      resume_quality: str(sourceMaterial.resume_quality, fallback.source_material_summary.resume_quality),
      linkedin_quality: str(sourceMaterial.linkedin_quality, fallback.source_material_summary.linkedin_quality),
      strongest_inputs: strArr(sourceMaterial.strongest_inputs, fallback.source_material_summary.strongest_inputs),
      missing_inputs: strArr(sourceMaterial.missing_inputs, fallback.source_material_summary.missing_inputs),
    },
    identity: {
      benchmark_headline: normalizeBenchmarkItem(identity.benchmark_headline, fallback.identity.benchmark_headline),
      why_me_story: normalizeBenchmarkItem(identity.why_me_story, fallback.identity.why_me_story),
      why_not_me: normalizeBenchmarkItem(identity.why_not_me, fallback.identity.why_not_me),
      operating_identity: normalizeBenchmarkItem(identity.operating_identity, fallback.identity.operating_identity),
    },
    proof: {
      signature_accomplishments: normalizeBenchmarkItemArray(proof.signature_accomplishments, fallback.proof.signature_accomplishments),
      proof_themes: normalizeBenchmarkItemArray(proof.proof_themes, fallback.proof.proof_themes),
      scope_markers: normalizeBenchmarkItemArray(proof.scope_markers, fallback.proof.scope_markers),
    },
    linkedin_brand: {
      five_second_verdict: normalizeBenchmarkItem(linkedinBrand.five_second_verdict, fallback.linkedin_brand.five_second_verdict),
      headline_direction: normalizeBenchmarkItem(linkedinBrand.headline_direction, fallback.linkedin_brand.headline_direction),
      about_opening: normalizeBenchmarkItem(linkedinBrand.about_opening, fallback.linkedin_brand.about_opening),
      recruiter_keywords: strArr(linkedinBrand.recruiter_keywords, fallback.linkedin_brand.recruiter_keywords),
      content_pillars: normalizeBenchmarkItemArray(linkedinBrand.content_pillars, fallback.linkedin_brand.content_pillars),
      profile_gaps: normalizeBenchmarkItemArray(linkedinBrand.profile_gaps, fallback.linkedin_brand.profile_gaps),
    },
    risk_and_gaps: {
      objections: normalizeBenchmarkItemArray(riskAndGaps.objections, fallback.risk_and_gaps.objections),
      adjacent_proof_needed: normalizeBenchmarkItemArray(riskAndGaps.adjacent_proof_needed, fallback.risk_and_gaps.adjacent_proof_needed),
      claims_to_soften: normalizeBenchmarkItemArray(riskAndGaps.claims_to_soften, fallback.risk_and_gaps.claims_to_soften),
    },
    approved_language: {
      positioning_statement: str(approvedLanguage.positioning_statement, fallback.approved_language.positioning_statement),
      resume_summary_seed: str(approvedLanguage.resume_summary_seed, fallback.approved_language.resume_summary_seed),
      linkedin_opening: str(approvedLanguage.linkedin_opening, fallback.approved_language.linkedin_opening),
      networking_intro: str(approvedLanguage.networking_intro, fallback.approved_language.networking_intro),
      cover_letter_thesis: str(approvedLanguage.cover_letter_thesis, fallback.approved_language.cover_letter_thesis),
    },
    discovery_questions: normalizeDiscoveryQuestions(r.discovery_questions, fallback.discovery_questions),
    downstream_readiness,
  };
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
    benchmark_profile: fallback.benchmark_profile
      ? normalizeBenchmarkProfileV1(r.benchmark_profile, fallback.benchmark_profile)
      : undefined,
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
