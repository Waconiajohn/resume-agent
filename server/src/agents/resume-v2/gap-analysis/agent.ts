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
import type { GapAnalysisInput, GapAnalysisOutput } from '../types.js';

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
      "importance": "must_have|important|nice_to_have",
      "classification": "strong|partial|missing",
      "evidence": ["specific evidence from the candidate's background"],
      "strategy": {
        "real_experience": "what the candidate actually has that's adjacent",
        "positioning": "how to phrase it on the resume",
        "inferred_metric": "$3M+ payroll budget (optional — only if inferring a number)",
        "inference_rationale": "team of 40 × $85K avg = $3.4M, backed off to $3M+ (optional)"
      }
    }
  ],
  "coverage_score": 75,
  "strength_summary": "2-3 sentences on the candidate's strongest positioning angles",
  "critical_gaps": ["gaps that truly cannot be addressed — be honest"],
  "pending_strategies": [
    {
      "requirement": "the requirement being addressed",
      "strategy": {
        "real_experience": "what they actually have",
        "positioning": "proposed resume phrasing",
        "inferred_metric": "conservative number if applicable",
        "inference_rationale": "the math/logic"
      }
    }
  ]
}

RULES:
- Every requirement from the job gets classified (strong/partial/missing).
- For STRONG matches: provide the evidence. No strategy needed.
- For PARTIAL matches: provide evidence AND a creative strategy to strengthen the positioning.
- For MISSING matches: provide a creative strategy if ANY adjacent experience exists. If truly missing, put it in critical_gaps.
- pending_strategies: include ALL strategies for partial/missing requirements. These go to the user for approval before being used in the resume.
- coverage_score: percentage of must_have + important requirements that are strong or have viable strategies.
- Be honest about critical_gaps — don't stretch beyond what's defensible.`;

export async function runGapAnalysis(
  input: GapAnalysisInput,
  signal?: AbortSignal,
): Promise<GapAnalysisOutput> {
  const userMessage = buildUserMessage(input);

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<GapAnalysisOutput>(response.text);
  if (!parsed) throw new Error('Gap Analysis agent returned unparseable response');
  return parsed;
}

function buildUserMessage(input: GapAnalysisInput): string {
  const parts: string[] = [
    '## Job Requirements (from Job Intelligence)',
    ...input.job_intelligence.core_competencies.map(
      c => `- [${c.importance}] ${c.competency}: ${c.evidence_from_jd}`
    ),
    '',
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
  ];

  if (input.user_context) {
    parts.push(
      '',
      '## Additional Context from User',
      input.user_context,
    );
  }

  parts.push(
    '',
    'Compare this candidate against EVERY requirement from the job. Classify each as strong/partial/missing. For partial and missing, propose creative positioning strategies.',
  );

  return parts.join('\n');
}
