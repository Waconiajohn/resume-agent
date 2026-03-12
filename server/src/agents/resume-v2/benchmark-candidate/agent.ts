/**
 * Agent 3: Benchmark Candidate
 *
 * Single-prompt agent that constructs the ideal candidate profile for a specific role.
 * This is what the hiring manager pictures when they imagine the perfect hire.
 *
 * THIS IS THE MOST IMPORTANT AGENT IN THE SYSTEM.
 * The benchmark sets the target the resume must match.
 *
 * Model: MODEL_PRIMARY
 */

import { llm, MODEL_PRIMARY } from '../../../lib/llm.js';
import { repairJSON } from '../../../lib/json-repair.js';
import type { BenchmarkCandidateInput, BenchmarkCandidateOutput } from '../types.js';

const SYSTEM_PROMPT = `You are the hiring manager for this role. You have been searching for the perfect candidate for 6 months. You've interviewed 50 people and none of them were right. Now describe EXACTLY who you're looking for.

Build a realistic hiring archetype — not a fantasy unicorn. This is someone who actually exists in the market. Think about:
- What have they done in the last 5 years that makes them perfect?
- What achievements would make you say "this is the one" in the first 30 seconds of reading their resume?
- What leadership scope demonstrates they can handle this role?
- What industry knowledge is non-negotiable vs. learnable?
- What would differentiate the top candidate from the other finalists?

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "ideal_profile_summary": "2-3 sentence description of the ideal candidate — be specific, not generic",
  "expected_achievements": [
    {
      "area": "domain of achievement",
      "description": "what they accomplished",
      "typical_metrics": "the numbers you'd expect to see"
    }
  ],
  "expected_leadership_scope": "team size, budget, P&L, geography they've managed",
  "expected_industry_knowledge": ["industries or domains they know deeply"],
  "expected_technical_skills": ["specific technologies and methodologies"],
  "expected_certifications": ["certifications that signal credibility (not all required)"],
  "differentiators": ["what separates the winner from other qualified candidates"]
}

RULES:
- Be SPECIFIC. "Strong leadership" is useless. "Led a 50-person engineering org through a platform migration while maintaining 99.9% uptime" is useful.
- expected_achievements: include 5-8 achievements with realistic metrics for this seniority level and industry.
- differentiators: what would make you pick THIS candidate over 4 other qualified people? Think about unique combinations of skills, unusual career arcs, or rare experience.
- expected_certifications: list relevant ones but note which are truly required vs. nice-to-have.
- This is a REALISTIC archetype. The person exists. They're currently employed somewhere and you're trying to recruit them.`;

export async function runBenchmarkCandidate(
  input: BenchmarkCandidateInput,
  signal?: AbortSignal,
): Promise<BenchmarkCandidateOutput> {
  const jobContext = [
    `Role: ${input.job_intelligence.role_title} at ${input.job_intelligence.company_name}`,
    `Industry: ${input.job_intelligence.industry}`,
    `Seniority: ${input.job_intelligence.seniority_level}`,
    '',
    'Core competencies required:',
    ...input.job_intelligence.core_competencies.map(
      c => `- [${c.importance}] ${c.competency}: ${c.evidence_from_jd}`
    ),
    '',
    'Strategic responsibilities:',
    ...input.job_intelligence.strategic_responsibilities.map(r => `- ${r}`),
    '',
    'Business problems to solve:',
    ...input.job_intelligence.business_problems.map(p => `- ${p}`),
    '',
    'Hidden hiring signals:',
    ...input.job_intelligence.hidden_hiring_signals.map(s => `- ${s}`),
  ].join('\n');

  const response = await llm.chat({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Build the ideal candidate profile for this role:\n\n${jobContext}` },
    ],
    max_tokens: 4096,
    signal,
  });

  const parsed = repairJSON<BenchmarkCandidateOutput>(response.text);
  if (!parsed) throw new Error('Benchmark Candidate agent returned unparseable response');
  return parsed;
}
