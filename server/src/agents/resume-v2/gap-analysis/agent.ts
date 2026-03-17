/**
 * Agent 4: Gap Analysis
 *
 * Compares the candidate against the benchmark with creative positioning strategies.
 * Doesn't just classify gaps — SOLVES them by finding adjacent real experience
 * and proposing how to position it.
 *
 * For inferred numbers (budgets from team sizes, etc.), backs off 10-20% from
 * the math so the candidate can comfortably defend the number in an interview.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import type {
  GapAnalysisInput,
  GapAnalysisOutput,
  RequirementCategory,
  RequirementCoverageBreakdown,
  RequirementGap,
  RequirementSource,
} from '../types.js';

const SYSTEM_PROMPT = `You are a $3,000/engagement executive resume strategist. Your specialty: finding creative, TRUTHFUL ways to close gaps between what a candidate has and what a job requires.

You NEVER fabricate experience. But you are CREATIVELY AGGRESSIVE about reframing real experience to close gaps:

CREATIVE STRATEGY EXAMPLES:
- "No budget management experience" → Do the math: team of 40 at ~$85K avg = $3.4M payroll. Back off to "$3M+ payroll budget" so they can defend it.
- "Requires Salesforce" but has HubSpot/Zoho → Position as "Enterprise CRM platforms including HubSpot and Zoho CRM" — same functional domain.
- "PMP certification required" but has 15 years of PM → "Extensive project and program leadership with working knowledge of PMI methodologies"
- "Revenue accountability" but ran support ops → Reframe: support operations that enabled revenue retention, customer lifetime value, upsell.
- "Call center centralization" but standardized processes → "Led initiatives to standardize operations across distributed teams" — that IS centralization.
- "AI automation experience" but implemented knowledge bases → "Automation-ready knowledge infrastructure enabling future AI/RAG capabilities"

IMPORTANT MATH RULE: When you infer a number from scope (like budget from team size), ALWAYS back off 10-20% from the calculated value. The candidate must be able to defend the number comfortably in an interview.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "requirements": [
    {
      "requirement": "what the job requires",
      "source": "job_description|benchmark",
      "category": "core_competency|strategic_responsibility|benchmark_leadership|benchmark_achievement|benchmark_skill|benchmark_certification|benchmark_industry|benchmark_differentiator",
      "score_domain": "ats|benchmark",
      "importance": "must_have|important|nice_to_have",
      "classification": "strong|partial|missing",
      "evidence": ["specific evidence from the candidate's background"],
      "source_evidence": "the JD or benchmark evidence that created this requirement",
      "strategy": {
        "real_experience": "what the candidate actually has that's adjacent",
        "positioning": "how to phrase it on the resume",
        "inferred_metric": "$3M+ payroll budget (optional — only if inferring a number)",
        "inference_rationale": "team of 40 × $85K avg = $3.4M, backed off to $3M+ (optional)",
        "ai_reasoning": "2-3 sentence conversational explanation for the candidate. Write as if you're coaching them: explain what you found, why it's relevant, and what math/logic supports it. Example: 'I noticed you managed a team of 40 at Company X. At roughly $85K average compensation, that's approximately $3.4M in payroll alone. I've backed this off to $3M+ so you can comfortably defend the number in an interview.'",
        "interview_questions": [
          {
            "question": "Your resume mentions managing operations at Company X. Can you tell us about the team size, budget responsibility, and geographic scope?",
            "rationale": "The JD requires P&L ownership — if they managed a team of 40+, the implied payroll budget alone could demonstrate budget accountability.",
            "looking_for": "Team size, budget figures, geographic span, or any P&L-adjacent responsibility"
          }
        ]
      }
    }
  ],
  "coverage_score": 75,
  "score_breakdown": {
    "job_description": {
      "total": 8,
      "strong": 3,
      "partial": 3,
      "missing": 2,
      "addressed": 6,
      "coverage_score": 75
    },
    "benchmark": {
      "total": 6,
      "strong": 2,
      "partial": 2,
      "missing": 2,
      "addressed": 4,
      "coverage_score": 67
    }
  },
  "strength_summary": "2-3 sentences on the candidate's strongest positioning angles",
  "critical_gaps": ["gaps that truly cannot be addressed — be honest"],
  "pending_strategies": [
    {
      "requirement": "the requirement being addressed",
      "strategy": {
        "real_experience": "what they actually have",
        "positioning": "proposed resume phrasing",
        "inferred_metric": "conservative number if applicable",
        "inference_rationale": "the math/logic",
        "ai_reasoning": "2-3 sentence conversational explanation for the candidate. Write as if you're coaching them: explain what you found, why it's relevant, and what math/logic supports it. Example: 'I noticed you managed a team of 40 at Company X. At roughly $85K average compensation, that's approximately $3.4M in payroll alone. I've backed this off to $3M+ so you can comfortably defend the number in an interview.'",
        "interview_questions": [
          {
            "question": "targeted question referencing specific roles/companies from the resume",
            "rationale": "why this question could surface useful evidence",
            "looking_for": "what kind of answer would strengthen the positioning"
          }
        ]
      }
    }
  ]
}

RULES:
- Preserve the source, category, and importance from the canonical requirement catalog exactly as provided.
- score_domain = 'ats' for job_description requirements. score_domain = 'benchmark' for benchmark requirements.
- source_evidence must explain where the requirement came from in the JD or benchmark profile.
- Every requirement from the job gets classified (strong/partial/missing).
- Include benchmark-only requirements too, even when the candidate will never fully close all of them. Those should surface as benchmark alignment opportunities, not ATS blockers.
- For STRONG matches: provide the evidence. No strategy needed.
- For PARTIAL matches: provide evidence AND a creative strategy to strengthen the positioning.
- For MISSING matches: provide a creative strategy if ANY adjacent experience exists. If truly missing, put it in critical_gaps.
- pending_strategies: include ALL strategies for partial/missing requirements. These go to the user for approval before being used in the resume.
- ai_reasoning: REQUIRED for every strategy (both in requirements[*].strategy and pending_strategies[*].strategy). Write as a coaching conversation — explain your reasoning to the candidate. Show your math. Be specific about what evidence you found and why it works. This text will be shown directly to the user.
- interview_questions: REQUIRED for every strategy (partial and missing). Generate 1-3 targeted questions that could surface hidden experience relevant to this gap. Questions MUST reference specific roles, companies, or evidence from the candidate's resume — never ask generic questions like "Tell me about your experience with X". Each question should have a rationale (why it matters) and looking_for (what kind of answer would help).
- coverage_score should reflect overall addressed requirements across the full canonical list. score_breakdown must split that into job_description and benchmark.
- Be honest about critical_gaps — don't stretch beyond what's defensible.`;

export async function runGapAnalysis(
  input: GapAnalysisInput,
  signal?: AbortSignal,
): Promise<GapAnalysisOutput> {
  const userMessage = buildUserMessage(input);

  // Attempt 1
  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<GapAnalysisOutput>(response.text);
  if (parsed) return normalizeGapAnalysis(parsed);

  // Attempt 2: retry with explicit JSON-only instruction
  logger.warn(
    { rawSnippet: response.text.substring(0, 500) },
    'Gap Analysis: first attempt unparseable, retrying with stricter prompt',
  );

  const retry = await llm.chat({
    model: MODEL_PRIMARY,
    system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
    messages: [{ role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` }],
    max_tokens: 8192,
    signal,
  });

  const retryParsed = repairJSON<GapAnalysisOutput>(retry.text);
  if (retryParsed) return normalizeGapAnalysis(retryParsed);

  logger.error(
    { rawSnippet: retry.text.substring(0, 500) },
    'Gap Analysis: both attempts returned unparseable response',
  );
  throw new Error('Gap Analysis agent returned unparseable response after 2 attempts');
}

function buildUserMessage(input: GapAnalysisInput): string {
  const canonicalRequirements: string[] = [
    ...input.job_intelligence.core_competencies.map(
      c => `- [source=job_description][category=core_competency][importance=${c.importance}] ${c.competency} :: ${c.evidence_from_jd}`,
    ),
    ...input.job_intelligence.strategic_responsibilities.map(
      responsibility => `- [source=job_description][category=strategic_responsibility][importance=important] ${responsibility} :: Strategic responsibility explicitly present in the JD`,
    ),
    `- [source=benchmark][category=benchmark_leadership][importance=important] ${input.benchmark.expected_leadership_scope} :: Leadership scope expected of the benchmark candidate`,
    ...input.benchmark.expected_achievements.map(
      a => `- [source=benchmark][category=benchmark_achievement][importance=important] ${a.area}: ${a.description} :: Typical metrics: ${a.typical_metrics}`,
    ),
    ...input.benchmark.expected_technical_skills.map(
      skill => `- [source=benchmark][category=benchmark_skill][importance=important] ${skill} :: Benchmark technical skill`,
    ),
    ...input.benchmark.expected_certifications.map(
      cert => `- [source=benchmark][category=benchmark_certification][importance=nice_to_have] ${cert} :: Benchmark certification expectation`,
    ),
    ...input.benchmark.expected_industry_knowledge.map(
      knowledge => `- [source=benchmark][category=benchmark_industry][importance=important] ${knowledge} :: Benchmark industry knowledge`,
    ),
    ...input.benchmark.differentiators.map(
      differentiator => `- [source=benchmark][category=benchmark_differentiator][importance=nice_to_have] ${differentiator} :: What makes the benchmark candidate stand out`,
    ),
  ];

  const parts: string[] = [
    '## Canonical Requirement Catalog',
    ...canonicalRequirements,
    '',
  ];

  if (input.career_profile) {
    parts.push(
      '## Career Profile',
      `Profile summary: ${input.career_profile.profile_summary}`,
      `Target roles: ${input.career_profile.targeting.target_roles.join(', ') || 'Not yet defined'}`,
      `Target industries: ${input.career_profile.targeting.target_industries.join(', ') || 'Not yet defined'}`,
      `Core strengths: ${input.career_profile.positioning.core_strengths.join(', ') || 'Not yet defined'}`,
      `Proof themes: ${input.career_profile.positioning.proof_themes.join(', ') || 'Not yet defined'}`,
      `Differentiators: ${input.career_profile.positioning.differentiators.join(', ') || 'Not yet defined'}`,
      `Adjacent positioning: ${input.career_profile.positioning.adjacent_positioning.join(', ') || 'Not yet defined'}`,
      `Constraints: ${input.career_profile.preferences.constraints.join(', ') || 'None recorded'}`,
      '',
    );
  }

  parts.push(
    '## Benchmark Candidate (the ideal hire)',
    `Profile: ${input.benchmark.ideal_profile_summary}`,
    `Leadership scope expected: ${input.benchmark.expected_leadership_scope}`,
    'Expected achievements:',
    ...input.benchmark.expected_achievements.map(
      a => `- ${a.area}: ${a.description} (typical metrics: ${a.typical_metrics})`
    ),
    '',
    '## Actual Candidate',
    `Career themes: ${input.candidate.career_themes.join(', ')}`,
    `Leadership scope: ${input.candidate.leadership_scope}`,
    `Operational scale: ${input.candidate.operational_scale}`,
    '',
    'Quantified outcomes:',
    ...input.candidate.quantified_outcomes.map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    'Experience:',
    ...input.candidate.experience.map(e => {
      const scope = e.inferred_scope
        ? ` (scope: team=${e.inferred_scope.team_size ?? '?'}, budget=${e.inferred_scope.budget ?? '?'}, geo=${e.inferred_scope.geography ?? '?'})`
        : '';
      return `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date})${scope}\n  ${e.bullets.slice(0, 5).join('\n  ')}`;
    }),
    '',
    'Hidden accomplishments detected:',
    ...input.candidate.hidden_accomplishments.map(h => `- ${h}`),
    '',
    `Technologies: ${input.candidate.technologies.join(', ')}`,
    `Certifications: ${input.candidate.certifications.join(', ')}`,
  );

  if (input.user_context) {
    parts.push(
      '',
      '## Additional Context from User',
      input.user_context,
    );
  }

  parts.push(
    '',
    'Compare this candidate against EVERY requirement in the canonical requirement catalog. Classify each as strong/partial/missing. For partial and missing, propose creative positioning strategies.',
  );

  return parts.join('\n');
}

function normalizeGapAnalysis(output: GapAnalysisOutput): GapAnalysisOutput {
  const requirements = output.requirements.map(normalizeRequirement);
  const jobBreakdown = computeCoverageBreakdown(requirements, 'job_description');
  const benchmarkBreakdown = computeCoverageBreakdown(requirements, 'benchmark');
  const total = jobBreakdown.total + benchmarkBreakdown.total;
  const addressed = jobBreakdown.addressed + benchmarkBreakdown.addressed;

  return {
    ...output,
    requirements,
    coverage_score: total > 0 ? Math.round((addressed / total) * 100) : 0,
    score_breakdown: {
      job_description: jobBreakdown,
      benchmark: benchmarkBreakdown,
    },
  };
}

function normalizeRequirement(requirement: RequirementGap): RequirementGap {
  const source: RequirementSource = requirement.source === 'benchmark' ? 'benchmark' : 'job_description';

  return {
    ...requirement,
    source,
    category: requirement.category ?? defaultCategoryForSource(source),
    score_domain: requirement.score_domain ?? (source === 'job_description' ? 'ats' : 'benchmark'),
    source_evidence: requirement.source_evidence,
  };
}

function defaultCategoryForSource(source: RequirementSource): RequirementCategory {
  return source === 'job_description' ? 'core_competency' : 'benchmark_achievement';
}

function computeCoverageBreakdown(
  requirements: RequirementGap[],
  source: RequirementSource,
): RequirementCoverageBreakdown {
  const scoped = requirements.filter((requirement) => requirement.source === source);
  const strong = scoped.filter((requirement) => requirement.classification === 'strong').length;
  const partial = scoped.filter((requirement) => requirement.classification === 'partial').length;
  const missing = scoped.filter((requirement) => requirement.classification === 'missing').length;
  const addressed = strong + partial;
  const total = scoped.length;

  return {
    total,
    strong,
    partial,
    missing,
    addressed,
    coverage_score: total > 0 ? Math.round((addressed / total) * 100) : 0,
  };
}
