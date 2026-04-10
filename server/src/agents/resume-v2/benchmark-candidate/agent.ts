/**
 * Agent 3: Benchmark Candidate
 *
 * Answers five specific questions about the candidate-to-role fit:
 * 1. What is this role actually solving for?
 * 2. What does this candidate have that directly matches?
 * 3. What is this candidate missing, and how disqualifying is each gap?
 * 4. What is the single narrative frame that makes this person the closest available match?
 * 5. What is the hiring manager afraid of when they see this resume?
 *
 * THIS IS THE MOST IMPORTANT AGENT IN THE SYSTEM.
 * The benchmark output governs all downstream agents.
 *
 * Model: MODEL_PRIMARY
 */

import { MODEL_PRIMARY } from '../../../lib/llm.js';
import { chatWithTruncationRetry } from '../../../lib/llm-retry.js';
import { queryWithFallback } from '../../../lib/perplexity.js';
import { repairJSON } from '../../../lib/json-repair.js';
import logger from '../../../lib/logger.js';
import { SOURCE_DISCIPLINE } from '../knowledge/resume-rules.js';
import type { BenchmarkCandidateInput, BenchmarkCandidateOutput } from '../types.js';

const SYSTEM_PROMPT = `You are the Benchmark Candidate Intelligence agent for CareerIQ. Your output governs every downstream agent in the resume pipeline. You must produce a structured assessment that is specific, takes real positions, and gives downstream agents precise instructions.

You will receive the candidate's full resume text and the complete job description analysis.

You must answer five questions in sequence and return a structured JSON object.

QUESTION 1: What is this role actually solving for?
Read between the lines of the JD. What business problem caused this company to open this position? Generate a specific hypothesis — not a restatement of the JD. This hypothesis informs how the candidate should be positioned.
Output: "role_problem_hypothesis" — 2-4 sentences, a specific hypothesis.

QUESTION 2: What does this candidate have that directly matches what this role requires?
Direct matches only. Stated with confidence, not hedged. Do not say "the candidate may have relevant experience." Say exactly what the candidate has and exactly what the JD requires. Classify each as STRONG or PARTIAL.
Output: "direct_matches" array — each entry names the specific JD requirement and the specific candidate evidence.

QUESTION 3: What is this candidate missing, and how disqualifying is each gap?
Classify every meaningful gap as one of three levels:
- DISQUALIFYING — the application will likely fail unless this gap is addressed directly and proactively
- MANAGEABLE — a real concern that can be bridged with positioning and framing
- NOISE — appears in the JD but is probably not what the hiring committee actually cares about
Provide a specific bridging strategy for DISQUALIFYING and MANAGEABLE gaps.
Output: "gap_assessment" array — each entry names the gap, assigns severity, and provides a bridging strategy.

QUESTION 4: What is the single narrative frame that makes this specific person the closest available match?
Take a position. Not a list of strengths. A single positioning statement. Given what this company is actually trying to solve, and given who this candidate actually is, what is the one story that makes them the benchmark candidate even though they do not check every box? Write this as a directive to downstream agents. Tell them what to lead with, what to subordinate, and what proof point closes the gap.
Output: "positioning_frame" — 3-5 sentences written as a directive.

QUESTION 5: What is the hiring manager afraid of when they see this resume?
Look at this specific resume and identify the specific fears a hiring manager would have before meeting this candidate. For displaced executives ages 45-65, hiring managers have specific fears: set in their ways, compensation too high, employment gap signals something wrong, peaked years ago, culture fit with younger team. Name fears triggered by THIS resume specifically. Then provide a neutralization strategy for each.
Output: "hiring_manager_objections" array — each entry names the specific objection and the neutralization strategy.

OUTPUT FORMAT: Return valid JSON matching this exact structure:
{
  "role_problem_hypothesis": "2-4 sentence hypothesis",
  "direct_matches": [
    { "jd_requirement": "string", "candidate_evidence": "string", "strength": "STRONG|PARTIAL" }
  ],
  "gap_assessment": [
    { "gap": "string", "severity": "DISQUALIFYING|MANAGEABLE|NOISE", "bridging_strategy": "string" }
  ],
  "positioning_frame": "3-5 sentence directive to downstream agents",
  "hiring_manager_objections": [
    { "objection": "string", "neutralization_strategy": "string" }
  ],
  "ideal_profile_summary": "2-3 sentence summary of the benchmark candidate for this role",
  "expected_achievements": [
    { "area": "string", "description": "string", "typical_metrics": "string" }
  ],
  "expected_leadership_scope": "string",
  "expected_industry_knowledge": ["string"],
  "expected_technical_skills": ["string"],
  "expected_certifications": ["string"],
  "differentiators": ["string"]
}

RULES:
- Be SPECIFIC. "Strong leadership" is useless. "Led a 50-person engineering org through a platform migration" is useful.
- direct_matches: include 5-10 matches with specific evidence from the candidate's actual background.
- gap_assessment: classify at least 3 gaps. Do NOT treat all gaps equally.
- positioning_frame: COMMIT to a frame. Do not generate balanced analysis. Take a stand.
- hiring_manager_objections: include at least 2. Name what in THIS resume triggers concern.
- The legacy fields (ideal_profile_summary through differentiators) must also be populated with content consistent with the new fields. expected_achievements should include 5-8 achievements. differentiators should list what separates this candidate from others.
- typical_metrics: Ground every number in the INDUSTRY RESEARCH provided. If the research doesn't cover a specific metric area, say "varies by organization" rather than inventing a number.
- Anchor the benchmark in the ACTUAL job and market, not prestige proxies.
- Do NOT add technologies, certifications, or domain experience that the JD and research do not support.

${SOURCE_DISCIPLINE}`;

export async function runBenchmarkCandidate(
  input: BenchmarkCandidateInput,
  signal?: AbortSignal,
  options?: { session_id?: string },
): Promise<BenchmarkCandidateOutput> {
  const { role_title, company_name, industry, seniority_level } = input.job_intelligence;

  // Build job context block
  const jobContext = [
    `Role: ${role_title} at ${company_name}`,
    `Industry: ${industry}`,
    `Seniority: ${seniority_level}`,
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

  // Build candidate context block
  const candidate = input.candidate;
  const candidateContext = [
    '',
    '## CANDIDATE PROFILE',
    `Name: ${candidate.contact.name}`,
    `Career themes: ${candidate.career_themes.join(', ')}`,
    `Leadership scope: ${candidate.leadership_scope}`,
    `Operational scale: ${candidate.operational_scale}`,
    `Career span: ${candidate.career_span_years} years`,
    `Industries: ${candidate.industry_depth.join(', ')}`,
    `Technologies: ${candidate.technologies.join(', ')}`,
    '',
    'Key quantified outcomes:',
    ...candidate.quantified_outcomes.slice(0, 10).map(
      o => `- [${o.metric_type}] ${o.outcome}: ${o.value}`
    ),
    '',
    'Recent experience:',
    ...candidate.experience.map(
      e => `- ${e.title} at ${e.company} (${e.start_date}–${e.end_date}): ${e.bullets.slice(0, 4).join('; ')}`
    ),
    '',
    'Hidden accomplishments:',
    ...candidate.hidden_accomplishments.map(a => `- ${a}`),
    '',
    'Education:',
    ...candidate.education.map(ed => `- ${ed.degree} from ${ed.institution}${ed.year ? ` (${ed.year})` : ''}`),
    '',
    'Certifications:',
    ...(candidate.certifications.length > 0 ? candidate.certifications.map(c => `- ${c}`) : ['- None listed']),
  ].join('\n');

  // Research real industry metrics from Perplexity before asking the LLM to build the benchmark.
  // Graceful degradation: if the research call fails for any reason, continue without it.
  let industryResearchBlock = '';
  try {
    const researchQuery =
      `What are typical achievements, metrics, and KPIs for a ${seniority_level} ${role_title} ` +
      `in ${industry}? Include realistic numbers for team sizes, budgets, revenue impact, ` +
      `cost savings, process improvements, and project scope.`;

    const sessionId = options?.session_id ?? 'benchmark-candidate';
    const researchText = await queryWithFallback(
      sessionId,
      [{ role: 'user', content: researchQuery }],
      {
        system: 'You are a compensation and career research analyst. Provide factual, data-grounded benchmarks. Be specific with numbers and ranges.',
        prompt: researchQuery,
      },
    );

    if (researchText.trim()) {
      industryResearchBlock = `\n\nINDUSTRY RESEARCH (use these real benchmarks to ground your metrics — do not invent numbers):\n${researchText.trim()}`;
      logger.info(
        { role_title, seniority_level, industry },
        'Benchmark Candidate: industry research retrieved from Perplexity',
      );
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err), role_title, industry },
      'Benchmark Candidate: industry research failed, proceeding without real-world metrics',
    );
  }

  const userMessage = `Build the benchmark candidate assessment for this role and candidate:\n\n## JOB ANALYSIS\n${jobContext}\n${candidateContext}${industryResearchBlock}`;

  // Attempt 1
  const response = await chatWithTruncationRetry({
    model: MODEL_PRIMARY,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage },
    ],
    max_tokens: 8192,
    signal,
  });

  const parsed = repairJSON<BenchmarkCandidateOutput>(response.text);
  if (parsed && isValidBenchmarkOutput(parsed)) return normalizeBenchmarkOutput(parsed);

  // Attempt 2: retry with explicit JSON-only instruction
  logger.warn(
    { rawSnippet: response.text.substring(0, 500) },
    'Benchmark Candidate: first attempt unparseable or incomplete, retrying with stricter prompt',
  );

  const retry = await chatWithTruncationRetry({
    model: MODEL_PRIMARY,
    system: 'You are a JSON extraction machine. Return ONLY valid JSON — no markdown fences, no commentary, no text before or after the JSON object. Start with { and end with }.',
    messages: [
      { role: 'user', content: `${SYSTEM_PROMPT}\n\n${userMessage}` },
    ],
    max_tokens: 8192,
    signal,
  });

  const retryParsed = repairJSON<BenchmarkCandidateOutput>(retry.text);
  if (retryParsed && isValidBenchmarkOutput(retryParsed)) return normalizeBenchmarkOutput(retryParsed);

  logger.error(
    { rawSnippet: retry.text.substring(0, 500) },
    'Benchmark Candidate: both attempts returned unparseable response',
  );
  throw new Error('Benchmark Candidate agent returned unparseable response after 2 attempts');
}

function isValidBenchmarkOutput(output: unknown): output is BenchmarkCandidateOutput {
  if (!output || typeof output !== 'object') return false;
  const o = output as Record<string, unknown>;
  return typeof o.role_problem_hypothesis === 'string'
    && Array.isArray(o.direct_matches)
    && Array.isArray(o.gap_assessment)
    && typeof o.positioning_frame === 'string'
    && Array.isArray(o.hiring_manager_objections);
}

function normalizeBenchmarkOutput(raw: BenchmarkCandidateOutput): BenchmarkCandidateOutput {
  const legacyFieldsMissing = !raw.ideal_profile_summary
    && (!Array.isArray(raw.expected_achievements) || raw.expected_achievements.length === 0)
    && (!Array.isArray(raw.differentiators) || raw.differentiators.length === 0);

  if (legacyFieldsMissing) {
    logger.warn(
      'Benchmark Candidate: LLM omitted legacy compatibility fields — gap analysis and resume writer will use reduced context',
    );
  }

  return {
    // New fields
    role_problem_hypothesis: raw.role_problem_hypothesis || '',
    direct_matches: Array.isArray(raw.direct_matches) ? raw.direct_matches : [],
    gap_assessment: Array.isArray(raw.gap_assessment) ? raw.gap_assessment : [],
    positioning_frame: raw.positioning_frame || '',
    hiring_manager_objections: Array.isArray(raw.hiring_manager_objections) ? raw.hiring_manager_objections : [],
    // Legacy fields — populated by the LLM or synthesized from new fields
    ideal_profile_summary: raw.ideal_profile_summary || raw.role_problem_hypothesis || '',
    expected_achievements: Array.isArray(raw.expected_achievements) ? raw.expected_achievements : [],
    expected_leadership_scope: raw.expected_leadership_scope || '',
    expected_industry_knowledge: Array.isArray(raw.expected_industry_knowledge) ? raw.expected_industry_knowledge : [],
    expected_technical_skills: Array.isArray(raw.expected_technical_skills) ? raw.expected_technical_skills : [],
    expected_certifications: Array.isArray(raw.expected_certifications) ? raw.expected_certifications : [],
    differentiators: Array.isArray(raw.differentiators) ? raw.differentiators : [],
  };
}
